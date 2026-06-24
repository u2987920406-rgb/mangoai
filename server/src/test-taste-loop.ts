// Tests de la boucle fermée (taste-loop.ts) — runs injectés, déterministe.

import { favoredIds, type LoopDeps } from "./taste-loop.js";
import type { TasteRun } from "./taste-queue.js";
import type { SkinRender } from "./taste-render.js";

let pass = 0, fail = 0;
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

function sk(id: string, score?: number): SkinRender { return { id, name: id, ok: true, palette: [], score }; }
function run(maille: "skin" | "hero", chosenId: string | undefined, status: TasteRun["status"], skins: SkinRender[]): TasteRun {
  return { id: "r" + Math.random().toString(36).slice(2, 6), project: "p", maille, createdAt: "", status, chosenId, skins };
}
function deps(runs: TasteRun[]): LoopDeps { return { loadRuns: () => runs }; }

// ── aucun historique → [] (samplers inchangés) ──
check("aucun run → []", favoredIds("hero", deps([])).length === 0);
check("aucun run décidé → []", favoredIds("hero", deps([run("hero", undefined, "pending", [sk("a")])])).length === 0);

// ── fréquence de choix = signal fort ──
{
  const runs = [
    run("hero", "carte-flottante", "decided", [sk("carte-flottante", 80), sk("plein-ecran-overlay", 90)]),
    run("hero", "carte-flottante", "decided", [sk("carte-flottante", 70)]),
    run("hero", "plein-ecran-overlay", "decided", [sk("plein-ecran-overlay", 95)]),
  ];
  const fav = favoredIds("hero", deps(runs));
  check("classe par fréquence de choix (carte-flottante 2× avant plein-ecran 1×)", JSON.stringify(fav) === JSON.stringify(["carte-flottante", "plein-ecran-overlay"]));
  check("ne renvoie que des ids choisis", fav.every((id) => ["carte-flottante", "plein-ecran-overlay"].includes(id)));
}

// ── score moyen départage à fréquence égale ──
{
  const runs = [
    run("skin", "minimal-froid", "decided", [sk("minimal-froid", 70)]),
    run("skin", "glass-sombre", "decided", [sk("glass-sombre", 95)]),
  ];
  const fav = favoredIds("skin", deps(runs));
  check("à 1 choix chacun, le mieux noté passe devant", fav[0] === "glass-sombre" && fav[1] === "minimal-froid");
}

// ── filtre par maille ──
{
  const runs = [
    run("hero", "carte-flottante", "decided", [sk("carte-flottante", 80)]),
    run("skin", "minimal-froid", "decided", [sk("minimal-froid", 90)]),
  ];
  check("favoredIds('hero') ignore les runs skin", JSON.stringify(favoredIds("hero", deps(runs))) === JSON.stringify(["carte-flottante"]));
  check("favoredIds('skin') ignore les runs hero", JSON.stringify(favoredIds("skin", deps(runs))) === JSON.stringify(["minimal-froid"]));
}

// ── un run décidé sans chosenId est ignoré ──
check("decided sans chosenId → ignoré", favoredIds("hero", deps([run("hero", undefined, "decided", [sk("a", 99)])])).length === 0);

console.log(`\n${pass} pass / ${fail} fail`);
if (fail > 0) process.exit(1);
