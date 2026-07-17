import { readFileSync, writeFileSync } from "fs";

const OUT_BASE = "D:/IA/MangoOS/workspace/toeic-quest/src/data/bank";
const LEVELS = ["debutant", "intermediaire", "avance"] as const;
const EXPORT_NAME: Record<string, string> = {
  debutant: "DEBUTANT_GEN",
  intermediaire: "INTERMEDIAIRE_GEN",
  avance: "AVANCE_GEN",
};

// Petit PRNG déterministe (seed fixe) pour un résultat reproductible.
function mulberry32(seed: number) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rebalanceLevel(level: string) {
  const path = `${OUT_BASE}/${level}.gen.js`;
  const text = readFileSync(path, "utf8");
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  const header = text.slice(0, start);
  const footer = text.slice(end + 1);
  const arr: any[] = JSON.parse(text.slice(start, end + 1));

  // Cible de distribution par nombre de choix (2,3,4 options) — répartir les index le plus uniformément possible.
  const byGroupKey = (n: number) => `n${n}`;
  const groups: Record<string, any[]> = {};
  for (const q of arr) {
    if (!Array.isArray(q.choices)) continue;
    const key = byGroupKey(q.choices.length);
    (groups[key] ||= []).push(q);
  }

  let rng = mulberry32(20260716);
  let moved = 0;

  for (const key of Object.keys(groups)) {
    const items = groups[key];
    const n = items[0].choices.length;
    // Mélange l'ordre de traitement pour ne pas biaiser par ordre de module.
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
    // Assigne un index cible cyclique (0..n-1) réparti uniformément.
    for (let i = 0; i < items.length; i++) {
      const q = items[i];
      const targetIdx = i % n;
      const currentIdx = q.answer;
      if (currentIdx === targetIdx) continue;
      const choices = q.choices as string[];
      const correctText = choices[currentIdx];
      // Permutation: place la bonne réponse à targetIdx, décale le reste dans l'ordre.
      const rest = choices.filter((_, idx) => idx !== currentIdx);
      const newChoices = [...rest];
      newChoices.splice(targetIdx, 0, correctText);
      q.choices = newChoices;
      q.answer = targetIdx;
      moved++;
    }
  }

  writeFileSync(path, header + JSON.stringify(arr, null, 2) + footer);
  const dist: Record<number, number> = {};
  for (const q of arr) dist[q.answer] = (dist[q.answer] || 0) + 1;
  console.log(`  🔀 ${level}: ${moved}/${arr.length} réponses déplacées — nouvelle distribution ${JSON.stringify(dist)}`);
}

for (const level of LEVELS) rebalanceLevel(level);
console.log("✅ Rééquilibrage terminé.");
