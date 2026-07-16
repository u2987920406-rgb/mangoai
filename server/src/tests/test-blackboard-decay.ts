// Test du câblage decay (kernel-blackboard-decay.ts) — le flag BLACKBOARD_TTL
// reste la SEULE porte : OFF par défaut → aucun effet, même avec des artefacts
// vieux/nombreux en place. ON → prune() réellement appelé sur les scopes de
// mémoire APPRISE, jamais sur CONCEPT_SCOPE (vérité validée par Raf).
//
// IMPORTANT : `MemoryStore` (backend par défaut) n'implémente PAS `prune()`
// (fail-open : `Blackboard.prune` retombe sur `?? 0`) — comme en production
// (index.ts n'active SqliteStore que si `BLACKBOARD_DB` est défini), ce test
// câble explicitement un `SqliteStore` temporaire pour observer une VRAIE purge.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Blackboard, setBlackboard, resetBlackboard, getBlackboard } from "../kernel/kernel-blackboard.js";
import { SqliteStore } from "../kernel/kernel-blackboard-sqlite.js";
import { runBlackboardDecay, DECAYABLE_SCOPES } from "../kernel/kernel-blackboard-decay.js";
import { CONCEPT_SCOPE } from "../concept-registry.js";

let pass = 0, fail = 0;
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mangoos-decay-"));
setBlackboard(new Blackboard(new SqliteStore(path.join(dir, "decay.db"))));
const bb = getBlackboard();
for (const scope of [...DECAYABLE_SCOPES, CONCEPT_SCOPE]) {
  for (let i = 0; i < 5; i++) bb.put(scope, `k${i}`, { v: i });
}

console.log("[1] BLACKBOARD_TTL=off (défaut) → no-op total");
{
  delete process.env.BLACKBOARD_TTL;
  const r = runBlackboardDecay();
  check("ranScopes vide", r.ranScopes.length === 0);
  check("totalDeleted = 0", r.totalDeleted === 0);
  for (const scope of DECAYABLE_SCOPES) {
    check(`scope ${scope} intact (5 clés)`, bb.keys(scope).length === 5);
  }
}

console.log("\n[2] BLACKBOARD_TTL=on → purge par volume (maxEntries), scopes APPRIS uniquement");
{
  const VERY_LARGE_TTL_MS = 365 * 24 * 60 * 60 * 1000; // isole l'effet du volume dans ce test
  process.env.BLACKBOARD_TTL = "on";
  const r = runBlackboardDecay(VERY_LARGE_TTL_MS, 2); // maxEntries=2 → garde les 2 plus récents
  check("tous les scopes décayables parcourus", r.ranScopes.length === DECAYABLE_SCOPES.length);
  for (const scope of DECAYABLE_SCOPES) {
    check(`scope ${scope} réduit à 2`, bb.keys(scope).length === 2);
  }
  check("CONCEPT_SCOPE (vérité validée) jamais touché", bb.keys(CONCEPT_SCOPE).length === 5);
  check("totalDeleted cohérent (3 par scope décayable)", r.totalDeleted === DECAYABLE_SCOPES.length * 3);
  delete process.env.BLACKBOARD_TTL;
}

bb.close();
resetBlackboard();
fs.rmSync(dir, { recursive: true, force: true });

console.log(`\n${fail === 0 ? "✅" : "❌"} blackboard-decay : ${pass} ok, ${fail} ko`);
if (fail > 0) process.exit(1);
