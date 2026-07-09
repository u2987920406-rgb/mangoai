// Idée #103 — Mango Agent Factory. Bus de messages fichiers inter-agents.
// Chaque message = un fichier JSON dans workspace/.agents/_bus/<to>/<id>.json.
// Atomic write (write tmp → rename) — même pattern que safe-io.ts.
// Les agents lisent leur inbox via GET /api/agents/:id/inbox (HTTP), jamais le FS directement.
import path from "node:path";
import fs from "node:fs";
import { WORKSPACE_DIR } from "../projects.js";
import type { AgentMessage, MessageType } from "./agent-types.js";

export const AGENTS_DIR = path.join(WORKSPACE_DIR, ".agents");
const BUS_DIR = path.join(AGENTS_DIR, "_bus");

// Deps injectables pour les tests déterministes.
export interface BusDeps {
  now: () => string;
  busDir: string;
}

const defaultDeps: BusDeps = {
  now: () => new Date().toISOString(),
  busDir: BUS_DIR,
};

export function inboxDir(agentId: string, busDir = BUS_DIR): string {
  return path.join(busDir, agentId);
}

function msgPath(agentId: string, msgId: string, busDir: string): string {
  return path.join(busDir, agentId, `${msgId}.json`);
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function sendMessage(
  msg: Omit<AgentMessage, "id" | "ts" | "status">,
  deps: BusDeps = defaultDeps,
): AgentMessage {
  const full: AgentMessage = {
    ...msg,
    id: generateId(),
    ts: deps.now(),
    status: "pending",
  };
  const dir = inboxDir(full.to, deps.busDir);
  fs.mkdirSync(dir, { recursive: true });
  const file = msgPath(full.to, full.id, deps.busDir);
  const tmp = `${file}.tmp`;
  const data = JSON.stringify(full, null, 2);
  fs.writeFileSync(tmp, data);
  try {
    fs.renameSync(tmp, file);
  } catch {
    fs.writeFileSync(file, data);
    fs.rmSync(tmp, { force: true });
  }
  return full;
}

export function readInbox(agentId: string, deps: BusDeps = defaultDeps): AgentMessage[] {
  const dir = inboxDir(agentId, deps.busDir);
  if (!fs.existsSync(dir)) return [];
  const now = Date.now();
  const results: AgentMessage[] = [];
  let files: string[];
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith(".json") && !f.endsWith(".tmp"));
  } catch {
    return [];
  }
  for (const file of files) {
    const full = path.join(dir, file);
    let msg: AgentMessage;
    try {
      msg = JSON.parse(fs.readFileSync(full, "utf8")) as AgentMessage;
    } catch {
      continue; // fichier corrompu → ignoré
    }
    // Expiration
    if (now - new Date(msg.ts).getTime() > msg.ttlMs) {
      try { fs.rmSync(full, { force: true }); } catch { /* ignore */ }
      continue;
    }
    if (msg.status === "pending") results.push(msg);
  }
  return results;
}

export function markRead(agentId: string, msgId: string, deps: BusDeps = defaultDeps): void {
  const file = msgPath(agentId, msgId, deps.busDir);
  if (!fs.existsSync(file)) return;
  let msg: AgentMessage;
  try {
    msg = JSON.parse(fs.readFileSync(file, "utf8")) as AgentMessage;
  } catch {
    return;
  }
  const updated: AgentMessage = { ...msg, status: "read", readAt: deps.now() };
  const tmp = `${file}.tmp`;
  const data = JSON.stringify(updated, null, 2);
  fs.writeFileSync(tmp, data);
  try {
    fs.renameSync(tmp, file);
  } catch {
    fs.writeFileSync(file, data);
    fs.rmSync(tmp, { force: true });
  }
}

export function purgeExpiredMessages(deps: BusDeps = defaultDeps): number {
  if (!fs.existsSync(deps.busDir)) return 0;
  const now = Date.now();
  let count = 0;
  let agentDirs: string[];
  try {
    agentDirs = fs.readdirSync(deps.busDir);
  } catch {
    return 0;
  }
  for (const agentId of agentDirs) {
    const dir = path.join(deps.busDir, agentId);
    let files: string[];
    try {
      files = fs.readdirSync(dir).filter((f) => f.endsWith(".json") && !f.endsWith(".tmp"));
    } catch {
      continue;
    }
    for (const file of files) {
      const full = path.join(dir, file);
      try {
        const msg = JSON.parse(fs.readFileSync(full, "utf8")) as AgentMessage;
        if (now - new Date(msg.ts).getTime() > msg.ttlMs) {
          fs.rmSync(full, { force: true });
          count++;
        }
      } catch {
        // fichier corrompu → purger aussi
        try { fs.rmSync(full, { force: true }); count++; } catch { /* ignore */ }
      }
    }
  }
  return count;
}
