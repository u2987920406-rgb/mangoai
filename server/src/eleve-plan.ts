// Plan d'exécution de l'Élève (#160 « planifier avant d'agir »).
//
// Transmission de compétence (directive permanente de Raf) : l'Élève GLM code
// linéairement, sans vue d'ensemble — il plonge dans read/write sans poser
// d'étapes, d'où oublis de morceaux, sur-exploration et tâtonnement. Claude, lui,
// pose un PLAN d'abord (un todo ordonné) puis l'exécute. On lui donne ce réflexe.
//
// Ce module = l'état ÉPHÉMÈRE du plan (durée d'une tâche), gardé IN-PROCESS — pas
// le Blackboard, réservé aux artefacts DURABLES cross-projet. Un plan vaut pour la
// tâche courante d'un projet : on l'écrase à chaque (re)planification, on le purge
// au démarrage d'une tâche. Les formateurs sont PURS (testables). L'« ancre » :
// `formatPlanReminder` est réinjecté dans le nudge d'auto-relance (eleve.ts) pour
// remettre le plan sous les yeux de l'Élève quand il dérive.

export interface PlanEtape {
  n: number;
  titre: string;
  detail?: string;
}

export interface ElevePlan {
  titre: string;
  etapes: PlanEtape[];
  at: number;
}

// ── Store éphémère par projet (in-process) ───────────────────────────────────
const plans = new Map<string, ElevePlan>();

export function setPlan(projectDir: string, plan: ElevePlan): void {
  plans.set(projectDir, plan);
}

export function getPlan(projectDir: string): ElevePlan | undefined {
  return plans.get(projectDir);
}

export function clearPlan(projectDir: string): void {
  plans.delete(projectDir);
}

// ── Formateurs PURS ──────────────────────────────────────────────────────────

/** Affichage initial renvoyé par l'outil `planifier` (plan posé). PUR. */
export function formatPlan(plan: ElevePlan): string {
  const lines = [`📋 Plan — ${plan.titre}`, ""];
  for (const e of plan.etapes) {
    lines.push(`${e.n}. ${e.titre}${e.detail ? ` — ${e.detail}` : ""}`);
  }
  lines.push(
    "",
    "→ Suis ce plan étape par étape. Après chaque étape qui touche au code, appelle check_build et corrige " +
      "avant de passer à la suivante. Si la tâche se révèle différente, re-planifie. N'oublie aucune étape ; finish seulement quand tout le plan est fait et vert.",
  );
  return lines.join("\n");
}

/** Rappel COMPACT du plan, réinjecté dans le nudge d'auto-relance (l'ancre). PUR. */
export function formatPlanReminder(plan: ElevePlan): string {
  const etapes = plan.etapes.map((e) => `${e.n}. ${e.titre}`).join(" · ");
  return (
    `📋 Rappel de TON plan « ${plan.titre} » : ${etapes}\n` +
    "→ Reprends les étapes encore non faites et termine-les — ne relâche pas avant que tout le plan soit livré."
  );
}

/**
 * Construit le coup de pouce d'auto-relance, PRÉFIXÉ du rappel du plan s'il en
 * existe un pour ce projet (l'ancre). Centralisé ici → testable. `lookup` injectable.
 */
export function buildRelanceNudge(
  projectDir: string,
  why: string,
  relances: number,
  max: number,
  lookup: (dir: string) => ElevePlan | undefined = getPlan,
): string {
  const plan = lookup(projectDir);
  const rappel = plan ? `${formatPlanReminder(plan)}\n\n` : "";
  return (
    `${rappel}⚠ Tu t'es arrêté sans appeler finish (${why}). Tu as DÉJÀ exploré le projet — n'explore PLUS, ne relis rien. ` +
    `AGIS maintenant : fais directement les edit_file/write_file qui manquent pour terminer la tâche, ` +
    `vérifie avec check_build, puis appelle finish. (relance ${relances}/${max})`
  );
}
