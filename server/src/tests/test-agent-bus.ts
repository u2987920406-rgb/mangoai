// Tests déterministes pour agent-bus.ts — aucun réseau, tmpdir dédié.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { sendMessage, readInbox, markRead, purgeExpiredMessages, inboxDir, type BusDeps } from "../agent/agent-bus.js";
import type { AgentMessage } from "../agent/agent-types.js";

let passed = 0;
let failed = 0;

function assert(label: string, condition: boolean): void {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.error(`  ❌ ${label}`);
    failed++;
  }
}

function makeDeps(busDir: string, now?: string): BusDeps {
  return { now: now ? () => now : () => new Date().toISOString(), busDir };
}

// ── Setup tmpdir ─────────────────────────────────────────────────────────────

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mango-bus-test-"));
const cleanup = () => fs.rmSync(tmpDir, { recursive: true, force: true });
process.on("exit", cleanup);

// ── Test 1 : sendMessage crée le fichier au bon endroit ──────────────────────

console.log("\n1. sendMessage — fichier créé");
{
  const deps = makeDeps(tmpDir);
  const msg = sendMessage({ from: "__mango__", to: "agent-a", type: "task", payload: { x: 1 }, ttlMs: 3_600_000 }, deps);
  const dir = inboxDir("agent-a", tmpDir);
  const file = path.join(dir, `${msg.id}.json`);
  assert("fichier existe", fs.existsSync(file));
  const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as AgentMessage;
  assert("id correspond", parsed.id === msg.id);
  assert("status = pending", parsed.status === "pending");
  assert("type = task", parsed.type === "task");
  assert("payload correct", (parsed.payload as { x: number }).x === 1);
}

// ── Test 2 : readInbox retourne les messages pending ─────────────────────────

console.log("\n2. readInbox — retourne pending");
{
  const dir2 = path.join(tmpDir, "test2");
  const deps = makeDeps(dir2);
  sendMessage({ from: "__mango__", to: "agent-b", type: "task", payload: "hello", ttlMs: 3_600_000 }, deps);
  sendMessage({ from: "__mango__", to: "agent-b", type: "event", payload: "ev", ttlMs: 3_600_000 }, deps);
  const inbox = readInbox("agent-b", deps);
  assert("2 messages dans inbox", inbox.length === 2);
  assert("tous pending", inbox.every((m) => m.status === "pending"));
}

// ── Test 3 : readInbox expire les TTL dépassés ───────────────────────────────

console.log("\n3. readInbox — expire les TTL dépassés");
{
  const dir3 = path.join(tmpDir, "test3");
  const oldTs = new Date(Date.now() - 7_200_000).toISOString(); // il y a 2h
  const deps = makeDeps(dir3, oldTs);
  sendMessage({ from: "__mango__", to: "agent-c", type: "task", payload: "old", ttlMs: 3_600_000 }, deps);
  // Lire avec l'heure réelle — TTL 1h déjà dépassé
  const depsNow = makeDeps(dir3);
  const inbox = readInbox("agent-c", depsNow);
  assert("message expiré absent", inbox.length === 0);
}

// ── Test 4 : markRead met à jour le status ────────────────────────────────────

console.log("\n4. markRead — status mis à jour");
{
  const dir4 = path.join(tmpDir, "test4");
  const deps = makeDeps(dir4);
  const msg = sendMessage({ from: "__mango__", to: "agent-d", type: "ping", payload: null, ttlMs: 3_600_000 }, deps);
  markRead("agent-d", msg.id, deps);
  const file = path.join(dir4, "agent-d", `${msg.id}.json`);
  const updated = JSON.parse(fs.readFileSync(file, "utf8")) as AgentMessage;
  assert("status = read", updated.status === "read");
  assert("readAt défini", typeof updated.readAt === "string");
}

// ── Test 5 : purgeExpiredMessages supprime les expirés ───────────────────────

console.log("\n5. purgeExpiredMessages — supprime expirés");
{
  const dir5 = path.join(tmpDir, "test5");
  const oldTs = new Date(Date.now() - 7_200_000).toISOString();
  const depsOld = makeDeps(dir5, oldTs);
  const depsNew = makeDeps(dir5);
  // 2 expirés
  sendMessage({ from: "__mango__", to: "agent-e", type: "task", payload: 1, ttlMs: 3_600_000 }, depsOld);
  sendMessage({ from: "__mango__", to: "agent-e", type: "task", payload: 2, ttlMs: 3_600_000 }, depsOld);
  // 1 valide
  sendMessage({ from: "__mango__", to: "agent-e", type: "task", payload: 3, ttlMs: 3_600_000 }, depsNew);
  const purged = purgeExpiredMessages(depsNew);
  assert("2 messages purgés", purged === 2);
  const inbox = readInbox("agent-e", depsNew);
  assert("1 message encore valide", inbox.length === 1);
}

// ── Test 6 : round-trip complet ───────────────────────────────────────────────

console.log("\n6. Round-trip : send → read → markRead → read vide");
{
  const dir6 = path.join(tmpDir, "test6");
  const deps = makeDeps(dir6);
  const msg = sendMessage({ from: "agent-f", to: "agent-g", type: "result", payload: { ok: true }, ttlMs: 3_600_000 }, deps);
  const inbox1 = readInbox("agent-g", deps);
  assert("1 message dans inbox", inbox1.length === 1);
  markRead("agent-g", msg.id, deps);
  const inbox2 = readInbox("agent-g", deps);
  assert("inbox vide après markRead (read ignoré)", inbox2.length === 0);
}

// ── Test 7 : inbox vide → [] sans exception ───────────────────────────────────

console.log("\n7. Inbox vide → [] sans exception");
{
  const dir7 = path.join(tmpDir, "test7");
  const deps = makeDeps(dir7);
  let inbox: AgentMessage[] = [];
  let threw = false;
  try {
    inbox = readInbox("agent-inexistant", deps);
  } catch {
    threw = true;
  }
  assert("pas d'exception", !threw);
  assert("retourne []", inbox.length === 0);
}

// ── Test 8 : fichier JSON corrompu → ignoré silencieusement ──────────────────

console.log("\n8. Fichier JSON corrompu → ignoré");
{
  const dir8 = path.join(tmpDir, "test8");
  const deps = makeDeps(dir8);
  const inboxD = inboxDir("agent-h", dir8);
  fs.mkdirSync(inboxD, { recursive: true });
  fs.writeFileSync(path.join(inboxD, "corrupt.json"), "{ NOT VALID JSON <<<");
  // Un message valide en plus
  sendMessage({ from: "__mango__", to: "agent-h", type: "task", payload: "ok", ttlMs: 3_600_000 }, deps);
  const inbox = readInbox("agent-h", deps);
  assert("le message valide est retourné", inbox.length === 1);
  assert("le corrompu est ignoré", inbox[0]?.payload === "ok");
}

// ── Résumé ────────────────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(40)}`);
console.log(`test-agent-bus : ${passed}/${passed + failed} tests passés`);
if (failed > 0) process.exit(1);
