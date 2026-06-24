// Moteur de Goût (#149 v2) — BOUCLE FERMÉE : ferme le cycle « mesurer → réinjecter » sur la
// GÉNÉRATION. Les choix passés de Raf (runs décidés de la file) biaisent le sampler de
// diversité VERS son goût appris, au lieu d'explorer à l'aveugle (farthest-point pur).
//
// On dérive les ids FAVORIS de l'axe qui varie : direction (maille « skin »), composition
// (maille « héros »). Le signal fort = ce que Raf a CHOISI ; le score du juge ne sert qu'à
// départager. Aucun historique → [] → samplers strictement inchangés (zéro régression).
// Pur ; `loadRuns` injectable → testable sans disque.

import { loadRuns, type TasteRun } from "./taste-queue.js";

export interface LoopDeps {
  loadRuns: () => TasteRun[];
}

const realDeps: LoopDeps = { loadRuns: () => loadRuns() };

/**
 * Ids favoris pour une maille, classés du plus au moins préféré :
 *   1) nombre de fois CHOISI (signal fort) ;
 *   2) à égalité, score moyen du juge quand cet id a été choisi ;
 *   3) à égalité, ordre alphabétique (déterministe).
 * Ne renvoie QUE des ids effectivement choisis (jamais une variante jamais retenue).
 */
export function favoredIds(maille: "skin" | "hero", deps: LoopDeps = realDeps): string[] {
  const runs = deps.loadRuns().filter((r) => r.status === "decided" && r.maille === maille && r.chosenId);
  const stat = new Map<string, { chosen: number; scoreSum: number; scoreN: number }>();
  for (const r of runs) {
    const id = r.chosenId!;
    const s = stat.get(id) ?? { chosen: 0, scoreSum: 0, scoreN: 0 };
    s.chosen += 1;
    const chosenSkin = r.skins.find((sk) => sk.id === id);
    if (chosenSkin && typeof chosenSkin.score === "number") { s.scoreSum += chosenSkin.score; s.scoreN += 1; }
    stat.set(id, s);
  }
  const avg = (s: { scoreSum: number; scoreN: number }) => (s.scoreN ? s.scoreSum / s.scoreN : 0);
  return [...stat.entries()]
    .sort((a, b) => {
      if (b[1].chosen !== a[1].chosen) return b[1].chosen - a[1].chosen;
      if (avg(b[1]) !== avg(a[1])) return avg(b[1]) - avg(a[1]);
      return a[0] < b[0] ? -1 : 1;
    })
    .map(([id]) => id);
}
