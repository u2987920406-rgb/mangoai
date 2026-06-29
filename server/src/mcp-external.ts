// LOADER DE SERVEURS MCP EXTERNES (Phase 3b) — le chaînon manquant : passer d'outils
// HARDCODÉS à une DÉCOUVERTE DYNAMIQUE. Jusqu'ici, seul `visionServer` (in-process) était
// branché ; aucun serveur MCP externe. Ce module se connecte à des serveurs MCP déclarés
// (process/stdio) et EXPOSE leurs outils dans la ToolRegistry de l'Élève (toOpenAITools).
//
// Cibles (data/mcp-servers.json) : Blender (modélisation/rendu/export glTF → assets pour le
// jeu Unity, synergie avec 3a), GIMP / Inkscape (logos, icônes, retouche, export).
//
// SÉCURITÉ (non négociable) :
//   • GATÉ : rien ne se charge sans ELEVE_MCP_EXTERNAL=on (zéro régression).
//   • DÉCLARATIF : uniquement les serveurs listés ET `enabled:true` (pas d'auto-découverte).
//   • SORTIES NEUTRALISÉES : tout retour d'un serveur externe est encadré sanitizeExternal
//     (lu comme DONNÉE, jamais comme instruction — anti prompt-injection).
//
// TESTABLE : le transport JSON-RPC est injectable (McpTransport) → les tests simulent un
// serveur en mémoire, sans lancer de process. Le transport réel (stdio) spawn la commande
// et échange en JSON-RPC délimité par des sauts de ligne (transport stdio MCP).

import fs from "node:fs";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { z, type ZodRawShape, type ZodTypeAny } from "zod";
import type { KernelTool, KernelToolResult } from "./kernel-mcp.js";
import { sanitizeExternal } from "./agent-contract.js";

// ── Config déclarative ───────────────────────────────────────────────────────

export interface McpServerConfig {
  id: string; // identifiant court (préfixe des outils → évite les collisions)
  label: string;
  command: string; // exécutable (ex. "python", "blender")
  args: string[]; // arguments (ex. ["-m", "blender_mcp"])
  cwd?: string;
  env?: Record<string, string>;
  enabled: boolean; // doit être true ET le gate ELEVE_MCP_EXTERNAL=on
}

/** Charge la config des serveurs MCP (data/mcp-servers.json). Défensif → [] si absent/cassé. */
export function loadMcpServers(configPath: string): McpServerConfig[] {
  try {
    const raw = JSON.parse(fs.readFileSync(configPath, "utf8")) as { servers?: unknown };
    const list = Array.isArray(raw.servers) ? raw.servers : [];
    return list
      .map((s) => s as Partial<McpServerConfig>)
      .filter((s): s is McpServerConfig => typeof s?.id === "string" && typeof s?.command === "string")
      .map((s) => ({
        id: s.id,
        label: s.label ?? s.id,
        command: s.command,
        args: Array.isArray(s.args) ? s.args.map(String) : [],
        cwd: typeof s.cwd === "string" ? s.cwd : undefined,
        env: s.env && typeof s.env === "object" ? (s.env as Record<string, string>) : undefined,
        enabled: s.enabled === true,
      }));
  } catch {
    return [];
  }
}

// ── JSON-RPC minimal sur transport injectable ────────────────────────────────

export interface JsonRpcMessage {
  jsonrpc: "2.0";
  id?: number | string;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export interface McpTransport {
  send: (msg: JsonRpcMessage) => void;
  onMessage: (cb: (msg: JsonRpcMessage) => void) => void;
  onClose: (cb: () => void) => void;
  close: () => void;
}

export interface McpToolDescriptor {
  name: string;
  description?: string;
  inputSchema?: { type?: string; properties?: Record<string, unknown>; required?: string[] };
}

const PROTOCOL_VERSION = "2024-11-05";

/** Client MCP minimal au-dessus d'un transport. Ne lève jamais hors timeout/erreur explicite. */
export class McpClient {
  private nextId = 1;
  private pending = new Map<number | string, { resolve: (m: JsonRpcMessage) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private closed = false;

  constructor(
    private transport: McpTransport,
    private timeoutMs = 30_000,
  ) {
    transport.onMessage((msg) => this.onMessage(msg));
    transport.onClose(() => {
      this.closed = true;
      for (const [, p] of this.pending) {
        clearTimeout(p.timer);
        p.reject(new Error("transport fermé"));
      }
      this.pending.clear();
    });
  }

  private onMessage(msg: JsonRpcMessage): void {
    if (msg.id === undefined) return; // notification serveur → ignorée
    const p = this.pending.get(msg.id);
    if (!p) return;
    clearTimeout(p.timer);
    this.pending.delete(msg.id);
    p.resolve(msg);
  }

  private request(method: string, params?: unknown): Promise<JsonRpcMessage> {
    if (this.closed) return Promise.reject(new Error("client fermé"));
    const id = this.nextId++;
    return new Promise<JsonRpcMessage>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`timeout MCP (${method})`));
      }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.transport.send({ jsonrpc: "2.0", id, method, params });
    });
  }

  private notify(method: string, params?: unknown): void {
    this.transport.send({ jsonrpc: "2.0", method, params });
  }

  /** Poignée de main MCP : initialize → notifications/initialized. */
  async initialize(): Promise<void> {
    const r = await this.request("initialize", {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "mangoos", version: "1.0.0" },
    });
    if (r.error) throw new Error(`initialize a échoué : ${r.error.message}`);
    this.notify("notifications/initialized");
  }

  async listTools(): Promise<McpToolDescriptor[]> {
    const r = await this.request("tools/list");
    if (r.error) throw new Error(`tools/list a échoué : ${r.error.message}`);
    const result = (r.result ?? {}) as { tools?: McpToolDescriptor[] };
    return Array.isArray(result.tools) ? result.tools : [];
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<{ text: string; isError: boolean }> {
    const r = await this.request("tools/call", { name, arguments: args });
    if (r.error) return { text: r.error.message, isError: true };
    const result = (r.result ?? {}) as { content?: Array<{ type?: string; text?: string }>; isError?: boolean };
    const text = (result.content ?? [])
      .map((c) => (typeof c.text === "string" ? c.text : ""))
      .filter(Boolean)
      .join("\n");
    return { text, isError: result.isError === true };
  }

  close(): void {
    this.closed = true;
    this.transport.close();
  }
}

// ── JSON Schema → ZodRawShape (pour respecter le contrat de ToolRegistry) ─────

/** Convertit une propriété de JSON Schema en type Zod permissif (préserve la valeur). PUR. */
export function jsonSchemaPropToZod(prop: unknown): ZodTypeAny {
  const p = (prop ?? {}) as { type?: string; description?: string; enum?: unknown[] };
  let base: ZodTypeAny;
  switch (p.type) {
    case "string":
      base = Array.isArray(p.enum) && p.enum.every((e) => typeof e === "string") ? z.enum(p.enum as [string, ...string[]]) : z.string();
      break;
    case "number":
    case "integer":
      base = z.number();
      break;
    case "boolean":
      base = z.boolean();
      break;
    case "array":
      base = z.array(z.any());
      break;
    case "object":
      base = z.record(z.string(), z.any());
      break;
    default:
      base = z.any();
  }
  return p.description ? base.describe(p.description) : base;
}

/** Construit un ZodRawShape à partir du inputSchema d'un outil MCP. PUR. */
export function mcpSchemaToShape(schema: McpToolDescriptor["inputSchema"]): ZodRawShape {
  const shape: Record<string, ZodTypeAny> = {};
  const props = schema?.properties ?? {};
  const required = new Set(schema?.required ?? []);
  for (const [key, prop] of Object.entries(props)) {
    const zt = jsonSchemaPropToZod(prop);
    shape[key] = required.has(key) ? zt : zt.optional();
  }
  return shape;
}

// ── Pont : outil MCP externe → KernelTool ────────────────────────────────────

/**
 * Enveloppe un outil MCP externe en KernelTool. Le nom est PRÉFIXÉ par l'id du serveur
 * (`blender__make_cube`) pour éviter les collisions. La sortie est NEUTRALISÉE
 * (sanitizeExternal). Ne lève jamais : une erreur réseau/serveur → KernelToolResult isError.
 */
export function mcpToolToKernel(serverId: string, client: McpClient, descriptor: McpToolDescriptor): KernelTool {
  const name = `${serverId}__${descriptor.name}`;
  return {
    name,
    description: `[MCP ${serverId}] ${descriptor.description ?? descriptor.name}`,
    inputSchema: mcpSchemaToShape(descriptor.inputSchema),
    handler: async (args): Promise<KernelToolResult> => {
      try {
        const r = await client.callTool(descriptor.name, args);
        return { text: sanitizeExternal(r.text), isError: r.isError };
      } catch (e) {
        return { text: `Outil MCP « ${name} » indisponible : ${e instanceof Error ? e.message : String(e)}`, isError: true };
      }
    },
  };
}

// ── Transport réel stdio (spawn) ─────────────────────────────────────────────

/** Transport JSON-RPC stdio : une ligne = un message JSON (transport stdio MCP). */
export function stdioTransport(cfg: McpServerConfig): McpTransport {
  const child: ChildProcess = spawn(cfg.command, cfg.args, {
    cwd: cfg.cwd,
    env: cfg.env ? { ...process.env, ...cfg.env } : process.env,
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });
  let buf = "";
  let msgCb: ((m: JsonRpcMessage) => void) | null = null;
  let closeCb: (() => void) | null = null;

  child.stdout?.on("data", (d: Buffer) => {
    buf += d.toString();
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      try {
        msgCb?.(JSON.parse(line) as JsonRpcMessage);
      } catch {
        /* ligne non-JSON (log serveur) → ignorée */
      }
    }
  });
  child.on("exit", () => closeCb?.());
  child.on("error", () => closeCb?.());

  return {
    send: (msg) => {
      try {
        child.stdin?.write(JSON.stringify(msg) + "\n");
      } catch {
        /* stdin fermé : best-effort */
      }
    },
    onMessage: (cb) => {
      msgCb = cb;
    },
    onClose: (cb) => {
      closeCb = cb;
    },
    close: () => {
      try {
        child.kill();
      } catch {
        /* déjà mort */
      }
    },
  };
}

// ── Chargement de haut niveau ────────────────────────────────────────────────

export interface LoadedMcp {
  tools: KernelTool[];
  clients: McpClient[];
  /** Ferme tous les serveurs spawné. À appeler en fin de session. */
  closeAll: () => void;
}

export interface McpLoaderDeps {
  loadServers: (configPath: string) => McpServerConfig[];
  makeTransport: (cfg: McpServerConfig) => McpTransport;
  timeoutMs?: number;
}

const realLoaderDeps: McpLoaderDeps = {
  loadServers: loadMcpServers,
  makeTransport: stdioTransport,
};

/**
 * Charge les serveurs MCP externes ACTIVÉS et renvoie leurs outils prêts à enregistrer.
 * GATÉ : si ELEVE_MCP_EXTERNAL !== "on", renvoie vide (zéro régression). Un serveur qui
 * échoue à s'initialiser est SAUTÉ (les autres se chargent) — jamais de blocage global.
 */
export async function loadExternalMcpTools(configPath: string, deps: McpLoaderDeps = realLoaderDeps): Promise<LoadedMcp> {
  if (process.env.ELEVE_MCP_EXTERNAL !== "on") {
    return { tools: [], clients: [], closeAll: () => {} };
  }
  const servers = deps.loadServers(configPath).filter((s) => s.enabled);
  const tools: KernelTool[] = [];
  const clients: McpClient[] = [];

  for (const cfg of servers) {
    try {
      const client = new McpClient(deps.makeTransport(cfg), deps.timeoutMs);
      await client.initialize();
      const descriptors = await client.listTools();
      for (const d of descriptors) {
        if (d?.name) tools.push(mcpToolToKernel(cfg.id, client, d));
      }
      clients.push(client);
    } catch {
      /* serveur HS → on saute, les autres continuent */
    }
  }

  return {
    tools,
    clients,
    closeAll: () => {
      for (const c of clients) {
        try {
          c.close();
        } catch {
          /* best-effort */
        }
      }
    },
  };
}

/** Chemin par défaut de la config (data/mcp-servers.json à la racine du repo). */
export function defaultMcpConfigPath(): string {
  return path.resolve(process.cwd(), "data", "mcp-servers.json");
}
