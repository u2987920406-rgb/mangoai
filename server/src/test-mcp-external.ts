// Tests du loader MCP externe (Phase 3b). Serveur MCP SIMULÉ en mémoire (transport
// injecté) → aucun process lancé. On exerce : parsing config, JSON Schema → Zod,
// poignée de main + tools/list + tools/call, pont KernelTool (préfixe + sanitize +
// préservation des args via ToolRegistry), gate ELEVE_MCP_EXTERNAL, serveur HS sauté.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  loadMcpServers,
  jsonSchemaPropToZod,
  mcpSchemaToShape,
  mcpToolToKernel,
  McpClient,
  loadExternalMcpTools,
  type McpTransport,
  type JsonRpcMessage,
  type McpServerConfig,
  type McpToolDescriptor,
} from "./mcp-external.js";
import { ToolRegistry } from "./kernel-mcp.js";
import { z } from "zod";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.log(`  ✗ ${label}`);
  }
}

/** Transport simulant un serveur MCP : `behavior(req)` renvoie la réponse (ou null). */
function fakeTransport(behavior: (req: JsonRpcMessage) => JsonRpcMessage | null, capture?: (req: JsonRpcMessage) => void): McpTransport {
  let msgCb: ((m: JsonRpcMessage) => void) | null = null;
  let closeCb: (() => void) | null = null;
  return {
    send: (msg) => {
      capture?.(msg);
      if (msg.id === undefined) return; // notification → pas de réponse
      Promise.resolve().then(() => {
        const r = behavior(msg);
        if (r && msgCb) msgCb(r);
      });
    },
    onMessage: (cb) => (msgCb = cb),
    onClose: (cb) => (closeCb = cb),
    close: () => closeCb?.(),
  };
}

const TOOLS: McpToolDescriptor[] = [
  {
    name: "make_cube",
    description: "Crée un cube",
    inputSchema: { type: "object", properties: { size: { type: "number", description: "côté" }, name: { type: "string" } }, required: ["name"] },
  },
];

function standardServer(req: JsonRpcMessage): JsonRpcMessage | null {
  if (req.method === "initialize") return { jsonrpc: "2.0", id: req.id, result: { protocolVersion: "2024-11-05", capabilities: {} } };
  if (req.method === "tools/list") return { jsonrpc: "2.0", id: req.id, result: { tools: TOOLS } };
  if (req.method === "tools/call") {
    const p = req.params as { name: string; arguments: Record<string, unknown> };
    return { jsonrpc: "2.0", id: req.id, result: { content: [{ type: "text", text: `ok:${p.name}:${JSON.stringify(p.arguments)}` }] } };
  }
  return null;
}

async function run() {
  console.log("\n[1] loadMcpServers — parsing défensif");
  {
    const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "mcp-")), "servers.json");
    fs.writeFileSync(f, JSON.stringify({ servers: [{ id: "blender", command: "blender", args: ["--bg"], enabled: true, shell: true }, { label: "sans id" }] }));
    const list = loadMcpServers(f);
    check("1 serveur valide (l'entrée sans id/command rejetée)", list.length === 1);
    check("champs normalisés", list[0]!.id === "blender" && list[0]!.enabled === true && list[0]!.args.join() === "--bg");
    check("champ shell parsé (npx/.cmd)", list[0]!.shell === true);
    check("fichier absent → []", loadMcpServers("/nope/x.json").length === 0);
  }

  console.log("\n[2] JSON Schema → Zod");
  {
    check("string → ZodString", jsonSchemaPropToZod({ type: "string" }).safeParse("x").success);
    check("number → rejette une string", !jsonSchemaPropToZod({ type: "number" }).safeParse("x").success);
    check("enum → contraint", jsonSchemaPropToZod({ type: "string", enum: ["a", "b"] }).safeParse("c").success === false);
    const shape = mcpSchemaToShape(TOOLS[0]!.inputSchema);
    check("required (name) non optionnel, optional (size) optionnel", z.object(shape).safeParse({ name: "x" }).success && !z.object(shape).safeParse({ size: 2 }).success);
  }

  console.log("\n[3] McpClient — handshake + listTools + callTool");
  {
    const client = new McpClient(fakeTransport(standardServer), 2000);
    await client.initialize();
    const tools = await client.listTools();
    check("listTools renvoie make_cube", tools.length === 1 && tools[0]!.name === "make_cube");
    const r = await client.callTool("make_cube", { name: "c1", size: 2 });
    check("callTool renvoie le contenu texte", r.text.startsWith("ok:make_cube") && r.isError === false);
    client.close();
  }

  console.log("\n[4] McpClient — erreur serveur + timeout");
  {
    const errClient = new McpClient(fakeTransport((req) => ({ jsonrpc: "2.0", id: req.id, error: { code: -1, message: "boom" } })), 2000);
    const r = await errClient.callTool("x", {});
    check("erreur JSON-RPC → isError + message", r.isError === true && /boom/.test(r.text));

    const silent = new McpClient(fakeTransport(() => null), 60); // ne répond jamais
    let timedOut = false;
    try {
      await silent.initialize();
    } catch (e) {
      timedOut = /timeout/i.test(String(e));
    }
    check("pas de réponse → timeout", timedOut);
  }

  console.log("\n[5] mcpToolToKernel — préfixe, sanitize, args préservés via ToolRegistry");
  {
    let lastArgs: Record<string, unknown> | null = null;
    const client = new McpClient(
      fakeTransport((req) => {
        if (req.method === "tools/call") lastArgs = (req.params as { arguments: Record<string, unknown> }).arguments;
        return standardServer(req);
      }),
      2000,
    );
    await client.initialize();
    const kt = mcpToolToKernel("blender", client, TOOLS[0]!);
    check("nom préfixé par le serveur", kt.name === "blender__make_cube");
    check("description marque [MCP blender]", /\[MCP blender\]/.test(kt.description));

    const reg = new ToolRegistry();
    reg.register(kt);
    const res = await reg.invoke("blender__make_cube", { name: "c1", size: 3, ignoré: true });
    check("sortie neutralisée (UNTRUSTED)", /UNTRUSTED_INPUT/.test(res.text));
    check("args déclarés préservés", lastArgs !== null && (lastArgs as Record<string, unknown>)["name"] === "c1" && (lastArgs as Record<string, unknown>)["size"] === 3);
    check("clé non déclarée filtrée par le schéma", lastArgs !== null && !("ignoré" in (lastArgs as Record<string, unknown>)));
    client.close();
  }

  console.log("\n[6] mcpToolToKernel — ne lève jamais (callTool qui throw)");
  {
    const brokenClient = new McpClient(fakeTransport(() => null), 40);
    const kt = mcpToolToKernel("gimp", brokenClient, TOOLS[0]!);
    const res = await kt.handler({ name: "x" });
    check("indisponibilité → isError, pas d'exception", res.isError === true && /indisponible/.test(res.text));
  }

  console.log("\n[7] loadExternalMcpTools — gate + serveur HS sauté");
  {
    const cfgs: McpServerConfig[] = [
      { id: "blender", label: "B", command: "blender", args: [], enabled: true },
      { id: "cassé", label: "X", command: "x", args: [], enabled: true },
      { id: "off", label: "O", command: "o", args: [], enabled: false },
    ];
    const deps = {
      loadServers: () => cfgs,
      makeTransport: (cfg: McpServerConfig) =>
        cfg.id === "cassé" ? fakeTransport((req) => ({ jsonrpc: "2.0" as const, id: req.id, error: { code: -1, message: "init KO" } })) : fakeTransport(standardServer),
      timeoutMs: 1000,
    };

    const prev = process.env["ELEVE_MCP_EXTERNAL"];
    delete process.env["ELEVE_MCP_EXTERNAL"];
    const offLoad = await loadExternalMcpTools("/x.json", deps);
    check("gate OFF → aucun outil", offLoad.tools.length === 0);

    process.env["ELEVE_MCP_EXTERNAL"] = "on";
    const onLoad = await loadExternalMcpTools("/x.json", deps);
    check("gate ON → outils du serveur sain seulement (cassé sauté, off ignoré)", onLoad.tools.length === 1 && onLoad.tools[0]!.name === "blender__make_cube");
    onLoad.closeAll();
    if (prev === undefined) delete process.env["ELEVE_MCP_EXTERNAL"];
    else process.env["ELEVE_MCP_EXTERNAL"] = prev;
  }

  console.log(`\n${fail === 0 ? "✅" : "❌"} mcp-external : ${pass} pass, ${fail} fail`);
  if (fail > 0) process.exit(1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
