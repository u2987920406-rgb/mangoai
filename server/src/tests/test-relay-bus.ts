// Le relais Élève ALIMENTE le Bus de coûts (audit dormant #27) : un run réel publie chat.turn
// avec costUsd — sans quoi le cost-guard du Disjoncteur est aveugle. busTurn:false = pas de double compte.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { KernelBus, setBus, resetBus, WILDCARD, type MangoEnvelope } from "../kernel/kernel-bus.js";
import { runRelay, type RelayDeps } from "../eleve.js";
import { resolveProfile } from "../models/profile.js";
import type { Inspection } from "../inspection.js";

const ok = (): Inspection => ({ ok: true, signal: "ok", detail: "", durationMs: 0 });
const ko = (): Inspection => ({ ok: false, signal: "build-failed", detail: "x", durationMs: 0 });
const nonAgentic = resolveProfile("gemma4:12b");
for (const g of ["ELEVE_CLOSURE_GATE", "ELEVE_GATE_PARCOURS", "ELEVE_GATE_DUAL_SKIP_BLOCK", "ELEVE_ESCALATE_ON_BLOCK"]) delete process.env[g];

const bus = new KernelBus();
setBus(bus);
const seen: MangoEnvelope[] = [];
bus.subscribe(WILDCARD, "test", (e) => { seen.push(e); });
const flush = () => new Promise((r) => setTimeout(r, 30));

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "relay-bus-"));
const good: RelayDeps = {
  askEleve: async () => `<mangoos><write path="marker.txt">OK</write><summary>ok</summary></mangoos>`,
  inspect: async () => ok(),
  ensureDeps: async () => {},
  escalate: async () => ({ axiom: false, costUsd: 0.42, codeChanged: true }),
};
const r = await runRelay("tâche", dir, { profile: nonAgentic, maxEleveAttempts: 1 }, good);
await flush();
const turns = seen.filter((e) => e.type === "chat.turn");
assert.equal(turns.length, 1, "un run = un chat.turn");
assert.equal(turns[0].sender, path.basename(dir));
assert.equal(turns[0].kind, r.success ? "success" : "error");
assert.equal((turns[0].payload as { costUsd: number }).costUsd, r.costUsd);

// busTurn:false → rien publié (chat-route publie son propre tour)
seen.length = 0;
await runRelay("tâche", dir, { profile: nonAgentic, maxEleveAttempts: 1, busTurn: false }, good);
await flush();
assert.equal(seen.filter((e) => e.type === "chat.turn").length, 0, "busTurn:false ne publie pas");

// une exception du relais est publiée en erreur puis relancée
seen.length = 0;
const boom: RelayDeps = { ...good, ensureDeps: async () => { throw new Error("boom"); } };
await assert.rejects(() => runRelay("t", dir, { profile: nonAgentic }, boom), /boom/);
await flush();
const err = seen.filter((e) => e.type === "chat.turn");
assert.equal(err.length, 1);
assert.equal(err[0].kind, "error");
void ko;
resetBus();
fs.rmSync(dir, { recursive: true, force: true });
console.log("✓ test-relay-bus");
