// Visibilité des gates (audit dormant, règle 5) : tout gate lu en brut (`process.env.X === "on"`)
// DOIT être listé dans gates-status.ts — sinon il redevient invisible ; et le rapport dit l'état vrai.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gatesReport, RAW_GATES } from "../gates-status.js";
import { FLAGS } from "../flags.js";

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const files: string[] = [];
(function walk(d: string) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.name === "tests" || e.name === "node_modules") continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (p.endsWith(".ts")) files.push(p);
  }
})(SRC);

const known = new Set<string>([...RAW_GATES.map((g) => g.env), ...Object.values(FLAGS).map((f) => f.env)]);
const missing = new Set<string>();
for (const f of files) {
  const txt = fs.readFileSync(f, "latin1"); // certains fichiers contiennent un octet NUL
  for (const m of txt.matchAll(/process\.env\.([A-Z][A-Z0-9_]+)\s*===\s*"on"/g)) if (!known.has(m[1])) missing.add(`${m[1]} (${path.relative(SRC, f)})`);
}
assert.deepEqual([...missing], [], `gates bruts absents de gates-status.ts : ${[...missing].join(", ")}`);

// pas de doublon registre/brut
const reg = new Set<string>(Object.values(FLAGS).map((f) => f.env));
assert.deepEqual(RAW_GATES.filter((g) => reg.has(g.env)).map((g) => g.env), [], "un gate est soit au registre, soit brut, pas les deux");

// le rapport reflète l'environnement : défaut, override explicite, et plafonds toujours finis
const base = gatesReport({} as NodeJS.ProcessEnv);
const state = (r: ReturnType<typeof gatesReport>, env: string) => [...r.armed, ...r.off].find((g) => g.env === env)!;
assert.equal(state(base, "NOCTURNAL_BUDGET_HARD").active, true);
assert.equal(state(base, "ELEVE_UNITY").active, false);
const tweaked = gatesReport({ NOCTURNAL_BUDGET_HARD: "off", ELEVE_UNITY: "on" } as unknown as NodeJS.ProcessEnv);
assert.equal(state(tweaked, "ELEVE_UNITY").active, true);
assert.equal(state(tweaked, "NOCTURNAL_BUDGET_HARD").active, false, "désarmement explicite visible dans le rapport");
assert.match(tweaked.caps[0].note, /DÉSARMÉ/);
assert.ok(base.caps.length >= 3 && base.caps.every((c) => c.finite), "aucun plafond $ illimité");
assert.equal(base.armed.length + base.off.length, new Set([...base.armed, ...base.off].map((g) => g.env)).size, "pas de doublon");
console.log("✓ test-gates-status");
