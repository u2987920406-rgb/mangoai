// Preuve déterministe du cache sémantique des appels LLM purs (#182 D5/É4).
//   npx tsx src/test-llm-cache.ts
// Zéro réseau : `embed` est injecté (vecteurs fabriqués), le Blackboard est un
// MemoryStore frais par scénario (pas de SQLite/disque). Le seul comportement
// externe observé est le NOMBRE d'appels au modèle réel (`ask`), via un compteur.
import { flag } from "./flags.js";
import { Blackboard } from "./kernel-blackboard.js";
import { MemoryStore } from "./kernel-blackboard-store.js";
import { cachedComplete } from "./llm-cache.js";

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean): void {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.error(`  ❌ ${name}`);
  }
}

// Gate ON pour tout le fichier — sans quoi cachedComplete court-circuite vers `ask` direct.
process.env.LLM_SEMANTIC_CACHE = "on";
check("gate LLM_SEMANTIC_CACHE actif", flag("LLM_SEMANTIC_CACHE") === true);

function spyAsk(reply = "réponse-modèle") {
  let calls = 0;
  const ask = async (_sys: string, _user: string) => {
    calls++;
    return reply;
  };
  return { ask, calls: () => calls };
}

function fakeEmbed(vec: number[] | null) {
  return async (_text: string) => vec;
}

async function main() {
  // ── (1) Hit exact : même triplet providerModel+promptVersion+sys+user ────────
  {
    const bb = new Blackboard(new MemoryStore());
    const spy = spyAsk("A");
    const opts = {
      role: "t-exact",
      providerModel: "openai:glm-5.2",
      promptVersion: "v1",
      ask: spy.ask,
      blackboard: bb,
      embed: fakeEmbed([1, 0, 0]),
    };
    const r1 = await cachedComplete("sys", "user identique", opts);
    const r2 = await cachedComplete("sys", "user identique", opts);
    check("hit exact : réponse stable", r1 === "A" && r2 === "A");
    check("hit exact : un seul appel modèle", spy.calls() === 1);
  }

  // ── (2) Hit sémantique : embeddings proches (cosinus ≥ 0.97) ─────────────────
  {
    const bb = new Blackboard(new MemoryStore());
    const spy = spyAsk("B");
    const base = {
      role: "t-semantic",
      providerModel: "openai:glm-5.2",
      promptVersion: "v1",
      ask: spy.ask,
      blackboard: bb,
    };
    // cos([1,0], [0.99, sqrt(1-0.99^2)]) = 0.99 ≥ 0.97
    const close = Math.sqrt(1 - 0.99 * 0.99);
    await cachedComplete("sys", "formulation A", { ...base, embed: fakeEmbed([1, 0]) });
    const r2 = await cachedComplete("sys", "formulation B (autrement dit)", { ...base, embed: fakeEmbed([0.99, close]) });
    check("hit sémantique : réponse servie depuis le cache", r2 === "B");
    check("hit sémantique : un seul appel modèle malgré 2 formulations", spy.calls() === 1);
  }

  // ── (3) MISS volontaire à 0.9 (sous le seuil 0.97) — pas de faux hit ─────────
  {
    const bb = new Blackboard(new MemoryStore());
    const spy = spyAsk("C");
    const base = {
      role: "t-miss-09",
      providerModel: "openai:glm-5.2",
      promptVersion: "v1",
      ask: spy.ask,
      blackboard: bb,
    };
    // cos([1,0], [0.9, sqrt(1-0.9^2)]) = 0.9 < 0.97
    const close = Math.sqrt(1 - 0.9 * 0.9);
    await cachedComplete("sys", "question 1", { ...base, embed: fakeEmbed([1, 0]) });
    await cachedComplete("sys", "question 2 (proche mais pas identique)", { ...base, embed: fakeEmbed([0.9, close]) });
    check("miss à 0.9 : le modèle est rappelé (pas de faux hit)", spy.calls() === 2);
  }

  // ── (4) safeEmbed === null (Ollama down) → exact seul, jamais de throw ───────
  {
    const bb = new Blackboard(new MemoryStore());
    const spy = spyAsk("D");
    const base = {
      role: "t-embed-null",
      providerModel: "openai:glm-5.2",
      promptVersion: "v1",
      ask: spy.ask,
      blackboard: bb,
      embed: fakeEmbed(null),
    };
    // Exact toujours vivant : même sys/user → hit malgré embed=null.
    const r1 = await cachedComplete("sys", "même texte", base);
    const r2 = await cachedComplete("sys", "même texte", base);
    check("embed null : exact fonctionne toujours", r1 === "D" && r2 === "D" && spy.calls() === 1);

    // Textes différents + embed null → aucun sémantique possible → réappel, jamais de throw.
    let threw = false;
    try {
      await cachedComplete("sys", "texte différent", base);
    } catch {
      threw = true;
    }
    check("embed null : jamais de throw", threw === false);
    check("embed null : texte différent → nouvel appel modèle (pas de faux hit)", spy.calls() === 2);
  }

  // ── (5) Changement de promptVersion → cache busté ────────────────────────────
  {
    const bb = new Blackboard(new MemoryStore());
    const spy = spyAsk("E");
    const common = {
      role: "t-promptversion",
      providerModel: "openai:glm-5.2",
      ask: spy.ask,
      blackboard: bb,
      embed: fakeEmbed([1, 0, 0]),
    };
    await cachedComplete("sys", "même texte", { ...common, promptVersion: "v1" });
    await cachedComplete("sys", "même texte", { ...common, promptVersion: "v2" });
    check("promptVersion différent : cache busté, 2 appels modèle", spy.calls() === 2);
  }

  // ── (6) Gate OFF → appel direct, aucune écriture Blackboard ──────────────────
  {
    process.env.LLM_SEMANTIC_CACHE = "off";
    const bb = new Blackboard(new MemoryStore());
    const spy = spyAsk("F");
    const opts = {
      role: "t-gate-off",
      providerModel: "openai:glm-5.2",
      promptVersion: "v1",
      ask: spy.ask,
      blackboard: bb,
      embed: fakeEmbed([1, 0, 0]),
    };
    await cachedComplete("sys", "même texte", opts);
    await cachedComplete("sys", "même texte", opts);
    check("gate OFF : aucun cache, 2 appels modèle (byte-identique historique)", spy.calls() === 2);
    check("gate OFF : rien écrit dans le Blackboard", bb.keys("llm-cache:t-gate-off").length === 0);
    process.env.LLM_SEMANTIC_CACHE = "on";
  }

  console.log(`\n${passed} passés, ${failed} échoués`);
  if (failed > 0) process.exit(1);
}

main();
