// Tests purs du juge nocturne (#59) + boucle de build/réparation (#35 backend).
// Lancer : npx tsx src/test-nocturnal.ts
import { parseJudgeOutput, nocturnalRepairPrompt, ensureBuildPasses } from "./nocturnal.js";
import type { InspectionSignal } from "./inspection.js";

let pass = 0, fail = 0;
function check(label: string, cond: boolean): void {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

console.log("═".repeat(56));
console.log("nocturnal — parseJudgeOutput (#59)");
console.log("─".repeat(56));

// JSON propre
{
  const r = parseJudgeOutput('{"dims":{"design":8,"fonctionnel":7,"originalite":6,"coherence":9,"qualite":7},"score":7.4,"comment":"Propre."}');
  check("JSON propre → parsé", !!r);
  check("score conservé", r?.score === 7.4);
  check("dims.design = 8", r?.dims.design === 8);
  check("commentaire conservé", r?.comment === "Propre.");
}

// JSON entouré de texte/markdown → extrait quand même
{
  const r = parseJudgeOutput('Voici mon verdict :\n```json\n{"dims":{"design":5,"fonctionnel":5,"originalite":5,"coherence":5,"qualite":5}}\n```\nVoilà.');
  check("JSON dans du texte → extrait", !!r);
  check("score calculé depuis la moyenne quand absent", r?.score === 5);
}

// Clamp hors bornes + arrondi
{
  const r = parseJudgeOutput('{"dims":{"design":12,"fonctionnel":-3,"originalite":7.46,"coherence":0,"qualite":10},"score":99}');
  check("design clampé à 10", r?.dims.design === 10);
  check("fonctionnel clampé à 0", r?.dims.fonctionnel === 0);
  check("originalite arrondie à 7.5", r?.dims.originalite === 7.5);
  check("score clampé à 10", r?.score === 10);
}

// Alias anglais des dimensions
{
  const r = parseJudgeOutput('{"design":6,"functional":6,"originality":6,"coherence_profil":6,"quality":6}');
  check("alias anglais (functional/quality) reconnus", r?.dims.fonctionnel === 6 && r?.dims.qualite === 6);
}

// Entrées invalides
check("texte sans JSON → null", parseJudgeOutput("aucune note disponible") === null);
check("vide → null", parseJudgeOutput("") === null);

// Prompt de réparation (auto-réparation build, robustesse nocturne)
{
  const err = "Brochure.jsx:152:14: ERROR: Unexpected closing \"span\" tag";
  const p = nocturnalRepairPrompt(err);
  check("repair — réinjecte la sortie d'erreur du build", p.includes(err));
  check("repair — interdit d'ajouter une feature", p.includes("SANS ajouter de fonctionnalité"));
}

// ── ensureBuildPasses — frontend ET backend généré (api/) ───────────────────
console.log("═".repeat(56));
console.log("nocturnal — ensureBuildPasses (gate frontend + backend api/)");
console.log("─".repeat(56));

// Fabrique un `inspect` qui rend les signaux dans l'ordre (le dernier se répète).
function mkInspect(signals: InspectionSignal[]) {
  let i = 0;
  return async (_dir: string) => {
    const s = signals[Math.min(i, signals.length - 1)];
    i++;
    return { ok: s === "ok", signal: s, detail: `detail:${s}` };
  };
}

{
  let repairs = 0, installs = 0;
  const r = await ensureBuildPasses("d", {
    inspect: mkInspect(["build-failed", "ok"]),
    repairTurn: async () => { repairs++; },
    ensureBackendDeps: async () => { installs++; },
  });
  check("frontend build-failed → réparé → ok (non-régression)", r.ok && r.signal === "ok" && r.attempts === 1 && repairs === 1);
  check("frontend build-failed → aucune install backend", installs === 0);
}

{
  let repairs = 0, installs = 0;
  const r = await ensureBuildPasses("d", {
    inspect: mkInspect(["backend-failed", "ok"]),
    repairTurn: async () => { repairs++; },
    ensureBackendDeps: async () => { installs++; },
  });
  check("backend-failed → réparé par un tour → ok", r.ok && r.signal === "ok" && r.attempts === 1 && repairs === 1);
  check("backend-failed → pas d'install (deps déjà là)", installs === 0);
}

{
  let repairs = 0, installs = 0;
  const r = await ensureBuildPasses("d", {
    inspect: mkInspect(["backend-no-deps", "ok"]),
    repairTurn: async () => { repairs++; },
    ensureBackendDeps: async () => { installs++; },
  });
  check("backend-no-deps → install puis ok", r.ok && r.signal === "ok");
  check("backend-no-deps → install backend exactement 1×", installs === 1);
  check("install backend n'est PAS un tour de réparation (attempts 0)", r.attempts === 0 && repairs === 0);
}

{
  let repairs = 0, installs = 0;
  const r = await ensureBuildPasses("d", {
    inspect: mkInspect(["backend-no-deps", "backend-failed", "ok"]),
    repairTurn: async () => { repairs++; },
    ensureBackendDeps: async () => { installs++; },
  });
  check("séquence no-deps → install → failed → réparé → ok", r.ok && r.signal === "ok");
  check("séquence : install 1× puis réparation 1×", installs === 1 && repairs === 1 && r.attempts === 1);
}

{
  const r = await ensureBuildPasses("d", {
    inspect: mkInspect(["backend-no-deps"]),
    repairTurn: async () => {},
  });
  check("backend-no-deps sans installeur (test) → reste KO honnête", !r.ok && r.signal === "backend-no-deps");
}

{
  let installs = 0;
  const r = await ensureBuildPasses("d", {
    inspect: mkInspect(["backend-no-deps"]), // l'install ne résout jamais
    repairTurn: async () => {},
    ensureBackendDeps: async () => { installs++; },
  });
  check("install backend tentée 1× max (pas de boucle infinie)", installs === 1);
  check("install inefficace → KO honnête, pas de blocage", !r.ok && r.signal === "backend-no-deps");
}

{
  let repairs = 0;
  const r = await ensureBuildPasses("d", {
    inspect: mkInspect(["build-failed"]), // jamais résolu
    repairTurn: async () => { repairs++; },
  });
  check("build jamais réparable → plafond (2) atteint puis KO", r.attempts === 2 && repairs === 2 && !r.ok);
}

console.log("═".repeat(56));
if (fail === 0) console.log(`✅ All ${pass}/${pass} checks passed.`);
else { console.log(`❌ ${fail} échec(s) (${pass} ok).`); process.exit(1); }
