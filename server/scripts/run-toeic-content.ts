import "dotenv/config";
// ─── Générateur de contenu TOEIC piloté GLM ──────────────────────────────────
// GLM (l'Élève) rédige les questions TOEIC par module selon un schéma strict ;
// on valide, on récupère de vraies images Pexels, et on écrit la banque.
//   Lancer  :  npx tsx server/scripts/run-toeic-content.ts [moduleId...]   (vide = tous)
//   Reprend :  même commande (les modules déjà générés sont conservés)
// NB : si GLM est rate-limité/indisponible, voir assemble-toeic-content.ts (même
// pipeline de validation/écriture, alimenté par du contenu rédigé par agent).
import { askLLM } from "../src/llm/llm-engine.js";
import {
  LEVEL_SPECS, Spec, buildPrompt, extractJsonArray, validate, finalize,
  loadState, saveState, writeBank, outFor,
} from "./toeic-content-lib.js";

const GLM = {
  provider: "openai" as const,
  model: process.env.ELEVE_MODEL || "glm-5.2:cloud",
  baseUrl: process.env.ELEVE_API_URL,
  apiKeyEnv: "ELEVE_API_KEY",
  timeoutMs: 240_000,
  maxTokens: 9000,
};

async function generateModule(spec: Spec, level: string): Promise<any[]> {
  const { system, user } = buildPrompt(spec);
  let raw = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      raw = await askLLM(system, user, GLM);
      const arr = extractJsonArray(raw);
      const valid = arr.filter((it) => validate(it, spec));
      if (valid.length >= Math.ceil(spec.count * 0.6)) {
        const out: any[] = [];
        let n = 1;
        for (const it of valid) out.push(await finalize(it, spec, n++, level));
        return out;
      }
      console.log(`  ⚠ ${spec.id}: ${valid.length}/${arr.length} valides (tentative ${attempt + 1}) — retry`);
    } catch (e: any) {
      console.log(`  ⚠ ${spec.id}: parsing/échec (${e.message}) tentative ${attempt + 1}`);
    }
  }
  return [];
}

async function main() {
  const args = process.argv.slice(2);
  const level = (args[0] && LEVEL_SPECS[args[0]]) ? args.shift()! : "debutant";
  const allSpecs = LEVEL_SPECS[level];
  const specs = args.length ? allSpecs.filter((s) => args.includes(s.id)) : allSpecs;
  const state = loadState(level);
  console.log(`🍋 Génération de contenu TOEIC (GLM) — niveau ${level} — ${specs.length} module(s)\n`);
  for (const spec of specs) {
    if (state[spec.id]?.length && !args.includes(spec.id)) {
      console.log(`  ⏭  ${spec.id} déjà généré (${state[spec.id].length} q) — skip`);
      continue;
    }
    process.stdout.write(`  ✍  ${spec.id} (${spec.part}, ${spec.count} visées)… `);
    const items = await generateModule(spec, level);
    console.log(`${items.length} questions OK`);
    if (items.length) { state[spec.id] = items; saveState(level, state); writeBank(level, state, "glm-5.2:cloud (l'Élève)"); }
  }
  const total = Object.values(state).flat().length;
  console.log(`\n✅ Total banque ${level} générée : ${total} questions → ${outFor(level)}`);
}

main().catch((e) => { console.error("FATAL", e); process.exit(1); });
