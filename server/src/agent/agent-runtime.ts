// Idée #103 — Mango Agent Factory. Lifecycle des agents (start/stop/monitor).
// Chaque agent = un process Node.js enfant. Communication par HTTP + state.json.
// Verrou : Map<id, ChildProcess> — pas de runtimeRunning global (chaque agent
// a son verrou implicite via processes.has(id)).
import path from "node:path";
import fs from "node:fs";
import { spawn as nodeSpawn, type ChildProcess } from "node:child_process";
import { loadAgentDef, agentDir, loadAgentRegistry } from "./agent-factory.js";
import { atomicWriteFileSync } from "../safe-io.js";
import type { AgentDef, AgentRuntimeState, AgentStatus } from "./agent-types.js";

// ── Deps injectables (tests sans réseau) ─────────────────────────────────────

export interface RuntimeDeps {
  spawn: typeof nodeSpawn;
  now: () => string;
}

const defaultRuntimeDeps: RuntimeDeps = {
  spawn: nodeSpawn,
  now: () => new Date().toISOString(),
};

// ── Registre in-memory des processus actifs ───────────────────────────────────

const processes = new Map<string, ChildProcess>();
// Ring-buffer des 50 dernières lignes de log par agent
const logBuffers = new Map<string, string[]>();

let _healthTimer: ReturnType<typeof setInterval> | null = null;
const PORT = Number(process.env["PORT"] ?? 3000);

// ── Lecture / écriture de l'état ──────────────────────────────────────────────

export function readAgentState(agentId: string): AgentRuntimeState | null {
  const file = path.join(agentDir(agentId), "state.json");
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as AgentRuntimeState;
  } catch {
    return null;
  }
}

export function writeAgentState(agentId: string, patch: Partial<AgentRuntimeState>): void {
  const file = path.join(agentDir(agentId), "state.json");
  let current: AgentRuntimeState;
  try {
    current = JSON.parse(fs.readFileSync(file, "utf8")) as AgentRuntimeState;
  } catch {
    current = { id: agentId, status: "idle", taskCount: 0, errorCount: 0 };
  }
  const next = { ...current, ...patch, id: agentId };
  atomicWriteFileSync(file, JSON.stringify(next, null, 2));
}

// ── Logs (ring-buffer) ────────────────────────────────────────────────────────

export function readAgentLogs(agentId: string, lines = 50): string[] {
  const today = new Date().toISOString().slice(0, 10);
  const file  = path.join(agentDir(agentId), "logs", `${today}.log`);
  try {
    const content = fs.readFileSync(file, "utf8");
    const all     = content.split("\n").filter(Boolean);
    return all.slice(-lines);
  } catch {
    return logBuffers.get(agentId)?.slice(-lines) ?? [];
  }
}

function appendLog(agentId: string, line: string): void {
  if (!logBuffers.has(agentId)) logBuffers.set(agentId, []);
  const buf = logBuffers.get(agentId)!;
  buf.push(line);
  if (buf.length > 50) buf.shift();
}

// ── Health check ──────────────────────────────────────────────────────────────

export function isAgentAlive(agentId: string): boolean {
  if (!processes.has(agentId)) return false;
  const state = readAgentState(agentId);
  if (!state?.lastHeartbeat) return false;
  const def        = loadAgentDef(agentId);
  const intervalMs = def?.intervalMs ?? 60_000;
  const maxStale   = Math.max(intervalMs * 3, 120_000);
  const age        = Date.now() - new Date(state.lastHeartbeat).getTime();
  return age < maxStale;
}

// ── Start ─────────────────────────────────────────────────────────────────────

export async function startAgent(
  agentId: string,
  deps: RuntimeDeps = defaultRuntimeDeps,
): Promise<{ ok: boolean; pid?: number; error?: string }> {
  if (processes.has(agentId)) {
    return { ok: false, error: "Agent déjà en cours d'exécution" };
  }

  const def = loadAgentDef(agentId);
  if (!def) return { ok: false, error: `Agent introuvable : ${agentId}` };

  const dir     = agentDir(agentId);
  const agentJs = path.join(dir, "agent.js");
  if (!fs.existsSync(agentJs)) return { ok: false, error: "agent.js introuvable" };

  const env = {
    ...process.env,
    MANGO_BASE_URL: `http://localhost:${PORT}`,
    ...def.envVars,
    // Jamais ANTHROPIC_API_KEY — l'agent passe par /api/agents/llm → abonnement
    ANTHROPIC_API_KEY: undefined as string | undefined,
  };
  delete env["ANTHROPIC_API_KEY"];

  // Passer "agent.js" en relatif (cwd=dir) pour éviter les problèmes de
  // chemin avec espaces sur Windows quand shell=true.
  const proc = deps.spawn("node", ["agent.js"], {
    cwd:   dir,
    env:   env as NodeJS.ProcessEnv,
    stdio: ["pipe", "pipe", "pipe"],
    shell: process.platform === "win32",
  });

  processes.set(agentId, proc);
  logBuffers.set(agentId, []);

  proc.stdout?.on("data", (chunk: Buffer) => {
    for (const line of chunk.toString().split("\n").filter(Boolean)) {
      appendLog(agentId, line);
    }
  });

  proc.stderr?.on("data", (chunk: Buffer) => {
    const msg = `[stderr] ${chunk.toString().trim()}`;
    appendLog(agentId, msg);
    writeAgentState(agentId, { status: "error" });
  });

  proc.on("exit", (code, signal) => {
    processes.delete(agentId);
    const reason = signal ?? `exit ${code}`;
    const status: AgentStatus = code === 0 ? "completed" : "error";
    writeAgentState(agentId, { status, stoppedAt: deps.now(), pid: undefined });
    appendLog(agentId, JSON.stringify({ ts: deps.now(), level: "info", message: `Process terminé : ${reason}` }));
  });

  writeAgentState(agentId, { status: "running", pid: proc.pid, startedAt: deps.now() });
  return { ok: true, pid: proc.pid };
}

// ── Stop ──────────────────────────────────────────────────────────────────────

export async function stopAgent(agentId: string): Promise<{ ok: boolean }> {
  const proc = processes.get(agentId);
  if (!proc) return { ok: true }; // déjà arrêté

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      try { proc.kill("SIGKILL"); } catch { /* ignore */ }
      resolve({ ok: true });
    }, 5000);

    proc.on("exit", () => {
      clearTimeout(timeout);
      resolve({ ok: true });
    });

    try {
      if (process.platform === "win32") {
        proc.kill();
      } else {
        proc.kill("SIGTERM");
      }
    } catch {
      clearTimeout(timeout);
      processes.delete(agentId);
      resolve({ ok: true });
    }
  });
}

// ── Restart ───────────────────────────────────────────────────────────────────

export async function restartAgent(
  agentId: string,
  deps: RuntimeDeps = defaultRuntimeDeps,
): Promise<{ ok: boolean; pid?: number; error?: string }> {
  await stopAgent(agentId);
  return startAgent(agentId, deps);
}

// ── Statut global ─────────────────────────────────────────────────────────────

export function runtimeStatus(): { activeCount: number } {
  return { activeCount: processes.size };
}

// ── Restaurer les agents au démarrage du serveur ──────────────────────────────

export async function restoreAgents(deps: RuntimeDeps = defaultRuntimeDeps): Promise<void> {
  const registry = loadAgentRegistry();
  for (const def of registry) {
    const state = readAgentState(def.id);
    // Ne redémarre que ceux qui étaient running (pas stopped/completed/error)
    if (state?.status === "running") {
      try {
        await startAgent(def.id, deps);
      } catch {
        writeAgentState(def.id, { status: "error" });
      }
    }
  }
  startHealthMonitor(deps);
}

// ── Health monitor (vérifie les heartbeats toutes les 30s) ───────────────────

export function startHealthMonitor(deps: RuntimeDeps = defaultRuntimeDeps): void {
  if (_healthTimer) return;
  _healthTimer = setInterval(() => {
    for (const [agentId] of processes) {
      if (!isAgentAlive(agentId)) {
        appendLog(agentId, JSON.stringify({
          ts: deps.now(), level: "warn",
          message: "Heartbeat périmé — agent présumé mort",
        }));
        processes.delete(agentId);
        writeAgentState(agentId, { status: "error", stoppedAt: deps.now(), pid: undefined });
      }
    }
  }, 30_000);
}
