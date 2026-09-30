// Repli de cerveau du moteur RÉEL de l'Élève (audit dormant #32).
import assert from "node:assert/strict";
import { withBrainFallback, isAvailabilityError } from "../eleve/post-fallback.js";
import { getBrain } from "../brain/brain-registry.js";
import type { PostFn } from "../eleve-runtime.js";

assert.ok(isAvailabilityError(new Error("OpenAI-compat HTTP 503")));
assert.ok(isAvailabilityError(new Error("OpenAI-compat HTTP 429")));
assert.ok(isAvailabilityError(new Error("fetch failed")));
assert.ok(isAvailabilityError(new Error("terminated")));
assert.ok(!isAvailabilityError(new Error("OpenAI-compat HTTP 401")), "un 401 n'est pas de la disponibilité");
assert.ok(!isAvailabilityError(new Error("OpenAI-compat HTTP 400")));

const down: PostFn = async () => { throw new Error("OpenAI-compat HTTP 503"); };
const ok: PostFn = async () => ({ content: "depuis-le-repli" });
const chain = () => [{ provider: "claude" as const, model: "haiku" }, { provider: "openai" as const, model: "glm-5.3" }];
const calls: string[] = [];
const make = (m: string | undefined) => { calls.push(String(m)); return ok; };
const quiet = { warn: () => {} };

// primaire HS + repli armé → la cible openai répond (claude ignoré : pas de function-calling)
let r = await withBrainFallback(down, "deepseek", "codeur", { chain, makePost: make, enabled: () => true, ...quiet })([], null);
assert.equal(r.content, "depuis-le-repli");
assert.deepEqual(calls, ["glm-5.3"]);
// gate désarmé → l'erreur d'origine remonte, aucun repli tenté
calls.length = 0;
await assert.rejects(() => withBrainFallback(down, "d", "codeur", { chain, makePost: make, enabled: () => false, ...quiet })([], null), /503/);
assert.equal(calls.length, 0);
// erreur non-disponibilité (401) → pas de repli
await assert.rejects(() => withBrainFallback(async () => { throw new Error("OpenAI-compat HTTP 401"); }, "d", "codeur", { chain, makePost: make, enabled: () => true, ...quiet })([], null), /401/);
assert.equal(calls.length, 0);
// chaîne épuisée → erreur ORIGINALE
await assert.rejects(() => withBrainFallback(down, "d", "codeur", { chain, makePost: () => down, enabled: () => true, ...quiet })([], null), /503/);
// primaire OK → jamais de repli
calls.length = 0;
r = await withBrainFallback(ok, "d", "codeur", { chain, makePost: make, enabled: () => true, ...quiet })([], null);
assert.equal(calls.length, 0);

// le registre VIVANT déclare bien une chaîne pour le rôle réel de l'Élève
const fb = getBrain("codeur").fallback ?? [];
assert.ok(fb.length >= 1 && fb.some((f) => f.provider === "openai"), "codeur porte une chaîne de repli utilisable");
console.log("✓ test-post-fallback");
