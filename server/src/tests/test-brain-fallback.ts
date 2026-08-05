// Tests C2 (2026-07-03) — fallback AUTOMATIQUE inter-providers (brain-dispatch).
// Déterministe, zéro réseau : BRAIN_REGISTRY_FILE → fichier temp, transport `ask`
// + `sleep` injectés. Prouve le DOUBLE VERROU (flag + champ), le déclenchement sur
// timeout/erreur transport uniquement (pas parsing), la garde localOnly sur les
// cibles, l'héritage de modèle, et le comptage d'appels (gate off = 1 seul appel).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { saveBrainRegistry, type BrainConfig, type AgentId } from "../brain/brain-registry.js";
import { dispatch, resetRateLimits, type AskFn } from "../brain/brain-dispatch.js";
import type { AskLLMOptions } from "../llm/llm-engine.js";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "mango-brain-fallback-"));
process.env.BRAIN_REGISTRY_FILE = path.join(TMP, "brain-registry.json");

const okJson = (s = "ok") => `<<<MANGO>>>{"status":"${s}","summary":"fait","data":{},"confidence":0.9}<<<END>>>`;
const noSleep = async () => {};

/** Enregistre UN rôle (juge) avec la config donnée. */
function setJuge(cfg: Partial<BrainConfig>): void {
  const reg = {} as Record<AgentId, BrainConfig>;
  // On ne configure que `juge` ; les autres retombent sur les défauts au load.
  reg["juge" as AgentId] = { provider: "ollama", model: "qwen3.5:cloud", ...cfg } as BrainConfig;
  saveBrainRegistry(reg);
}

/** Transport `ask` scripté : chaque appel consomme une entrée de `plan`
 *  ("throw" = erreur transport, "hang" = jamais résolu → timeout, sinon = réponse).
 *  Compte les appels et capture les opts (pour vérifier provider/model/endpoint). */
function scriptedAsk(plan: Array<"throw" | "hang" | string>): { ask: AskFn; calls: () => AskLLMOptions[] } {
  const seen: AskLLMOptions[] = [];
  let i = 0;
  const ask: AskFn = async (_system, _user, opts) => {
    seen.push(opts);
    const step = plan[Math.min(i, plan.length - 1)];
    i++;
    if (step === "throw") throw new Error("transport KO");
    if (step === "hang") return new Promise<string>(() => {}); // timeout
    return step;
  };
  return { ask, calls: () => seen };
}

async function run() {
  console.log("─".repeat(60));
  console.log("test-brain-fallback (C2)");
  console.log("─".repeat(60));

  const withFlag = (v: string | undefined, fn: () => Promise<void>) => {
    const prev = process.env.BRAIN_FALLBACK;
    if (v === undefined) delete process.env.BRAIN_FALLBACK; else process.env.BRAIN_FALLBACK = v;
    return fn().finally(() => { if (prev === undefined) delete process.env.BRAIN_FALLBACK; else process.env.BRAIN_FALLBACK = prev; });
  };

  console.log("\n[1] Gate OFF + champ présent → aucun repli (1 seul appel)");
  await withFlag(undefined, async () => {
    resetRateLimits();
    setJuge({ fallback: [{ provider: "claude", model: "haiku" }] });
    const { ask, calls } = scriptedAsk(["throw"]);
    const r = await dispatch("juge", "sys", "u", { ask, sleep: noSleep });
    check("résultat dégradé (échec, pas de repli)", r.status === "error");
    check("brainUsed absent (aucun repli)", r.brainUsed === undefined);
  });

  console.log("\n[2] Flag ON + champ absent → aucun repli (1 seul appel)");
  await withFlag("on", async () => {
    resetRateLimits();
    setJuge({}); // pas de fallback
    const { ask, calls } = scriptedAsk(["throw"]);
    const r = await dispatch("juge", "sys", "u", { ask, sleep: noSleep });
    check("un seul appel (pas de chaîne déclarée)", calls().length === 1);
    check("dégradé", r.status === "error");
  });

  console.log("\n[3] Flag ON + champ présent + 1er échoue, repli réussit");
  await withFlag("on", async () => {
    resetRateLimits();
    setJuge({ fallback: [{ provider: "claude", model: "haiku" }] });
    const { ask, calls } = scriptedAsk(["throw", okJson()]); // principal throw → repli ok
    const r = await dispatch("juge", "sys", "u", { ask, sleep: noSleep });
    check("deux appels (principal + repli)", calls().length === 2);
    check("résultat OK via repli", r.status === "ok");
    check("brainUsed.fallback === true", r.brainUsed?.fallback === true);
    check("brainUsed.provider = la cible (claude)", r.brainUsed?.provider === "claude");
    check("le 2e appel visait bien claude/haiku", calls()[1].provider === "claude" && calls()[1].model === "haiku");
  });

  console.log("\n[4] Timeout du principal déclenche AUSSI le repli");
  await withFlag("on", async () => {
    resetRateLimits();
    setJuge({ timeoutMs: 50, fallback: [{ provider: "claude", model: "haiku" }] });
    const { ask, calls } = scriptedAsk(["hang", okJson()]); // principal hang (timeout) → repli ok
    const r = await dispatch("juge", "sys", "u", { ask, sleep: noSleep });
    check("repli après timeout → OK", r.status === "ok" && r.brainUsed?.fallback === true);
    check("deux appels", calls().length === 2);
  });

  console.log("\n[5] Échec de PARSING (le modèle a répondu) → PAS de repli");
  await withFlag("on", async () => {
    resetRateLimits();
    setJuge({ fallback: [{ provider: "claude", model: "haiku" }] });
    const { ask, calls } = scriptedAsk(["ceci n'est pas du JSON Mango", okJson()]);
    const r = await dispatch("juge", "sys", "u", { ask, sleep: noSleep });
    check("un seul appel (parsing raté = pas un problème de dispo)", calls().length === 1);
    check("pas de brainUsed (aucun repli)", r.brainUsed === undefined);
  });

  console.log("\n[6] Chaîne : 1er échoue, 2e échoue, 3e (borné à 2) ignoré");
  await withFlag("on", async () => {
    resetRateLimits();
    // 3 cibles déclarées → coerceConfig borne à MAX_FALLBACK_CHAIN=2.
    setJuge({ fallback: [{ provider: "claude", model: "haiku" }, { provider: "openai", model: "x" }, { provider: "groq", model: "y" }] });
    const { ask, calls } = scriptedAsk(["throw", "throw", "throw"]); // tout échoue
    const r = await dispatch("juge", "sys", "u", { ask, sleep: noSleep });
    check("principal + 2 replis = 3 appels (3e cible tronquée)", calls().length === 3);
    check("résultat final dégradé (chaîne épuisée)", r.status === "error");
  });

  console.log("\n[7] Garde localOnly : un rôle localOnly ne bascule PAS vers un cloud");
  await withFlag("on", async () => {
    resetRateLimits();
    // localOnly + provider ollama (accepté) mais fallback vers claude (cloud) → refusé.
    setJuge({ provider: "ollama", model: "gemma4:12b", localOnly: true, fallback: [{ provider: "claude", model: "haiku" }] });
    const { ask, calls } = scriptedAsk(["throw", okJson()]);
    const r = await dispatch("juge", "sys", "u", { ask, sleep: noSleep });
    check("un seul appel (repli cloud refusé pour rôle localOnly)", calls().length === 1);
    check("pas de repli → dégradé", r.status === "error" && r.brainUsed === undefined);
  });

  console.log(`\n${fail === 0 ? "✅" : "❌"} brain-fallback : ${pass} pass, ${fail} fail`);
  fs.rmSync(TMP, { recursive: true, force: true });
  if (fail > 0) process.exit(1);
}

void run();
