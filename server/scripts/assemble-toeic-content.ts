import "dotenv/config";
// ─── Assemblage du contenu TOEIC rédigé par des agents Claude ────────────────
// Lit le JSON brut déjà rédigé par agent (1 fichier par module, déposé dans
// GEN_DIR par l'orchestrateur), valide, finalise (image Pexels réelle),
// écrit les banques .gen.js. Aucun appel LLM ici.
//   Lancer : npx tsx server/scripts/assemble-toeic-content.ts <level> [moduleId...]
import { readFileSync, existsSync } from "fs";
import {
  LEVEL_SPECS, extractJsonArray, validate, finalize,
  loadState, saveState, writeBank, outFor,
} from "./toeic-content-lib.js";

const GEN_DIR = process.env.TOEIC_GEN_DIR || "C:/Users/PC-DELL/AppData/Local/Temp/claude/D--IA-MangoOS/b0b8b415-78bd-48cc-8f59-05cbb1b5b599/scratchpad/toeic-gen";

async function main() {
  const args = process.argv.slice(2);
  const level = (args[0] && LEVEL_SPECS[args[0]]) ? args.shift()! : "debutant";
  const allSpecs = LEVEL_SPECS[level];
  const specs = args.length ? allSpecs.filter((s) => args.includes(s.id)) : allSpecs;
  const state = loadState(level);
  console.log(`🍋 Assemblage contenu TOEIC (agents Claude) — niveau ${level} — ${specs.length} module(s)\n`);

  for (const spec of specs) {
    const f = `${GEN_DIR}/${level}/${spec.id}.json`;
    if (!existsSync(f)) {
      console.log(`  ✗ ${spec.id} : fichier absent (${f}) — skip`);
      continue;
    }
    process.stdout.write(`  ✍  ${spec.id} (${spec.part}, ${spec.count} visées)… `);
    try {
      const raw = readFileSync(f, "utf8");
      const arr = extractJsonArray(raw);
      const valid = arr.filter((it) => validate(it, spec));
      if (!valid.length) { console.log(`0/${arr.length} valides — rejeté`); continue; }
      const items: any[] = [];
      let n = 1;
      for (const it of valid) items.push(await finalize(it, spec, n++, level));
      state[spec.id] = items;
      saveState(level, state);
      writeBank(level, state);
      console.log(`${items.length}/${arr.length} valides OK`);
    } catch (e: any) {
      console.log(`ÉCHEC parsing (${e.message})`);
    }
  }
  const total = Object.values(state).flat().length;
  console.log(`\n✅ Total banque ${level} assemblée : ${total} questions → ${outFor(level)}`);
}

main().catch((e) => { console.error("FATAL", e); process.exit(1); });
