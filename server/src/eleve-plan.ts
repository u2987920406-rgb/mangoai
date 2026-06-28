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
  /** Numéros d'étapes COCHÉES comme faites (L18). Optionnel → rétro-compat (absent = aucune). */
  done?: number[];
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

/** Coche l'étape `n` comme FAITE (L18). Idempotent, borné aux étapes valides.
 *  Renvoie le plan à jour, ou undefined s'il n'y a pas de plan courant. */
export function markStepDone(projectDir: string, n: number): ElevePlan | undefined {
  const plan = plans.get(projectDir);
  if (!plan) return undefined;
  const done = plan.done ?? (plan.done = []);
  if (Number.isInteger(n) && n >= 1 && n <= plan.etapes.length && !done.includes(n)) {
    done.push(n);
    done.sort((a, b) => a - b);
  }
  return plan;
}

/** Première étape non encore cochée (l'étape « en cours »). PUR. */
export function nextStep(plan: ElevePlan): PlanEtape | undefined {
  const done = plan.done ?? [];
  return plan.etapes.find((e) => !done.includes(e.n));
}

// ── Formateurs PURS ──────────────────────────────────────────────────────────

/** Affichage du plan avec cases à cocher + étape en cours (L18). PUR. */
export function formatPlan(plan: ElevePlan): string {
  const done = plan.done ?? [];
  const lines = [`📋 Plan — ${plan.titre}`, ""];
  for (const e of plan.etapes) {
    const ok = done.includes(e.n);
    lines.push(`${ok ? "☑" : "☐"} ${e.n}. ${e.titre}${e.detail ? ` — ${e.detail}` : ""}`);
  }
  const next = nextStep(plan);
  lines.push(
    "",
    next
      ? `→ Prochaine étape : ${next.n}. ${next.titre}. Fais-la, appelle check_build, puis coche-la avec etape_faite(${next.n}). ` +
          "Suis le plan dans l'ordre, n'oublie aucune étape ; finish seulement quand tout est coché et vert."
      : "→ Toutes les étapes sont cochées. Vérifie le build une dernière fois, puis appelle finish.",
  );
  return lines.join("\n");
}

/** Rappel COMPACT du plan (cases cochées + prochaine étape), réinjecté dans le
 *  nudge d'auto-relance — l'ancre qui remet sa PROGRESSION sous les yeux. PUR. */
export function formatPlanReminder(plan: ElevePlan): string {
  const done = plan.done ?? [];
  const etapes = plan.etapes.map((e) => `${done.includes(e.n) ? "☑" : "☐"}${e.n}. ${e.titre}`).join(" · ");
  const next = nextStep(plan);
  const suite = next
    ? `→ Reprends à l'étape ${next.n}. ${next.titre} et termine les étapes non cochées (☐) — ne relâche pas avant que tout le plan soit livré.`
    : "→ Toutes les étapes sont cochées : vérifie le build et appelle finish.";
  return `📋 Rappel de TON plan « ${plan.titre} » (${done.length}/${plan.etapes.length} fait) : ${etapes}\n${suite}`;
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

  // (L35/L47) ESCALADE DE CONVERGENCE : passé la moitié du budget de relances, on
  // durcit — la sur-exploration sur les tâches riches épuise le budget sans jamais
  // `finish`. On INTERDIT l'exploration et on force l'écriture de la prochaine étape.
  const next = plan ? nextStep(plan) : undefined;
  const late = relances >= Math.ceil(max / 2);
  const convergence = late
    ? `🔴 CONVERGENCE (relance ${relances}/${max} — budget presque épuisé) : tu as ASSEZ exploré. ` +
      `INTERDICTION d'appeler read_file / list_files / search_code. ` +
      (next
        ? `Écris MAINTENANT le code de l'étape ${next.n} (« ${next.titre} ») avec write_file/edit_file, `
        : `Écris MAINTENANT le code qui manque avec write_file/edit_file, `) +
      `puis check_build, etape_faite, et finish. Pas une lecture de plus.\n\n`
    : "";

  return (
    `${rappel}${convergence}⚠ Tu t'es arrêté sans appeler finish (${why}). Tu as DÉJÀ exploré le projet — n'explore PLUS, ne relis rien. ` +
    `AGIS maintenant : fais directement les edit_file/write_file qui manquent pour terminer la tâche, ` +
    `vérifie avec check_build, puis appelle finish. (relance ${relances}/${max})`
  );
}
