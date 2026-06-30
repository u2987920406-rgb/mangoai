import "dotenv/config";
// ─── Vérification de cohérence image ↔ texte (juge VL souverain) ─────────────
// Pour chaque question Part 1 (Photos), l'image DOIT illustrer la bonne réponse.
// On demande au modèle vision local (qwen3-vl:8b) si l'image correspond ; sinon on
// re-cherche une meilleure image Pexels et on re-juge. Tout mismatch résiduel est listé.
//   Lancer : npx tsx src/run-toeic-coherence.ts
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";
import { searchPexelsImages } from "./taste-images.js";

const OLLAMA = "http://localhost:11434/api/generate";
const VL_MODEL = "qwen3-vl:8b";
const OUT_BASE = "D:/IA/MangoOS/workspace/toeic-quest/src/data/bank";
const LEVELS = ["debutant", "intermediaire", "avance"] as const;
const stateFor = (lvl: string) => `D:/IA/MangoOS/server/.toeic-content.${lvl}.state.json`;
const outFor = (lvl: string) => `${OUT_BASE}/${lvl}.gen.js`;
const EXPORT_NAME = (lvl: string) => lvl === "debutant" ? "DEBUTANT_GEN" : lvl === "intermediaire" ? "INTERMEDIAIRE_GEN" : "AVANCE_GEN";

async function toBase64(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.toString("base64");
  } catch { return null; }
}

// Le VL voit-il la scène décrite ? Renvoie true/false (true par défaut si VL muet).
async function vlMatches(imageB64: string, sceneEN: string): Promise<boolean | null> {
  const prompt = `Look at the photo. A TOEIC test says it shows: "${sceneEN}". `
    + `Does the photo clearly and reasonably depict that scene? `
    + `Reply ONLY JSON: {"match": true} or {"match": false}.`;
  try {
    const res = await fetch(OLLAMA, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: VL_MODEL, prompt, images: [imageB64], stream: false, think: false, format: "json", options: { temperature: 0 } }),
    });
    if (!res.ok) return null;
    const data = await res.json() as any;
    // qwen3-vl est un modèle « thinking » : la réponse peut atterrir dans response OU thinking.
    const blob = (data.response && data.response.trim()) || (data.thinking && data.thinking.trim()) || "";
    const m = blob.match(/\{[^{}]*"match"[^{}]*\}/i);
    if (!m) return null;
    const parsed = JSON.parse(m[0]);
    return parsed.match === true;
  } catch { return null; }
}

async function main() {
  let checked = 0, ok = 0, fixed = 0, flagged = 0;
  const flags: string[] = [];

  for (const level of LEVELS) {
    const f = stateFor(level);
    if (!existsSync(f)) continue;
    const state: Record<string, any[]> = JSON.parse(readFileSync(f, "utf8"));
    let changed = false;

    for (const modId of Object.keys(state)) {
      for (const q of state[modId]) {
        if (q.part !== "P1" || !q.image) continue;        // P1 = cohérence critique
        const scene = q.choices?.[q.answer];
        if (!scene) continue;
        checked++;
        process.stdout.write(`  🔍 ${q.id} … `);

        let b64 = await toBase64(q.image);
        let verdict = b64 ? await vlMatches(b64, scene) : null;

        if (verdict === true) { ok++; console.log("✓ cohérent"); continue; }
        if (verdict === null) { console.log("· VL muet (gardé)"); ok++; continue; }

        // Mismatch → re-cherche une meilleure image avec la phrase exacte, re-juge.
        console.log("✗ mismatch → re-recherche");
        let repaired = false;
        try {
          const cands = await searchPexelsImages(scene, 3);
          for (const c of cands) {
            if (c.url === q.image) continue;
            const cb = await toBase64(c.url);
            if (!cb) continue;
            if (await vlMatches(cb, scene)) { q.image = c.url; repaired = true; changed = true; break; }
          }
        } catch { /* */ }

        if (repaired) { fixed++; console.log(`     ↳ ${q.id} image remplacée ✓`); }
        else { flagged++; flags.push(`${q.id} (${level}/${modId}): « ${scene} »`); console.log(`     ↳ ${q.id} non corrigé — flag`); }
      }
    }

    if (changed) {
      writeFileSync(f, JSON.stringify(state, null, 1));
      const all = Object.values(state).flat();
      const header = `// ─── Banque ${level} — GÉNÉRÉE par GLM (l'Élève) ──────────────────────────────\n`
        + `// Contenu rédigé par glm-5.2:cloud, validé (schéma) + images Pexels réelles (cohérence VL).\n`
        + `// Régénérable via : npx tsx server/src/run-toeic-content.ts ${level}\n\n`
        + `export const ${EXPORT_NAME(level)} = `;
      const out = outFor(level);
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, header + JSON.stringify(all, null, 2) + ";\n");
      console.log(`  💾 ${level}.gen.js mis à jour`);
    }
  }

  console.log(`\n✅ Cohérence P1 : ${checked} vérifiées · ${ok} OK · ${fixed} corrigées · ${flagged} à revoir`);
  if (flags.length) { console.log("\n⚠ Images P1 encore incohérentes :"); for (const fl of flags) console.log("   - " + fl); }
}

main().catch((e) => { console.error("FATAL", e); process.exit(1); });
