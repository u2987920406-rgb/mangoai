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
  /** (B1.1, 2026-07-03) Numéros d'étapes que l'Élève a signalées BLOQUÉES (gate
   *  ELEVE_PLAN_V2). Optionnel → rétro-compat (absent = aucune). Une étape bloquée
   *  reste « à faire » mais est signalée dans les rappels pour inviter à
   *  re-planifier ou contourner — au lieu de tourner en rond dessus. */
  blocked?: number[];
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

/** (B1.1) Marque l'étape `n` BLOQUÉE (gate ELEVE_PLAN_V2). Idempotent, borné aux
 *  étapes valides. Retire l'étape de `done` si elle y était (bloqué ≠ fait). Le
 *  blocage est un SIGNAL (le rendu invite à re-planifier/contourner), jamais une
 *  suppression. Renvoie le plan à jour, ou undefined s'il n'y a pas de plan. */
export function markStepBlocked(projectDir: string, n: number): ElevePlan | undefined {
  const plan = plans.get(projectDir);
  if (!plan) return undefined;
  if (!Number.isInteger(n) || n < 1 || n > plan.etapes.length) return plan;
  const blocked = plan.blocked ?? (plan.blocked = []);
  if (!blocked.includes(n)) {
    blocked.push(n);
    blocked.sort((a, b) => a - b);
  }
  if (plan.done) plan.done = plan.done.filter((d) => d !== n); // bloqué ≠ fait
  return plan;
}

/** Première étape non encore cochée (l'étape « en cours »). PUR. */
export function nextStep(plan: ElevePlan): PlanEtape | undefined {
  const done = plan.done ?? [];
  return plan.etapes.find((e) => !done.includes(e.n));
}

/** (B1.1) Y a-t-il au moins une étape bloquée non résolue (bloquée ET non faite) ? PUR. */
export function hasBlocked(plan: ElevePlan): boolean {
  const done = new Set(plan.done ?? []);
  return (plan.blocked ?? []).some((n) => !done.has(n));
}

/** Normalise un titre d'étape pour le matching (insensible casse/accents/espaces). PUR. */
function normTitle(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // retire les diacritiques combinants
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * (L56) Fusionne un nouveau plan avec l'existant en PRÉSERVANT la progression : une
 * étape du nouveau plan dont le titre correspond à une étape DÉJÀ cochée de l'ancien
 * reste cochée. Sans ça, re-`planifier` (relance « décompose » du Stratège) repartait
 * avec `done: []` → l'Élève réécrivait les premiers modules → drift d'API entre
 * générations. PUR : `existing` absent → le plan neuf est rendu tel quel.
 */
export function mergePlan(existing: ElevePlan | undefined, fresh: ElevePlan): ElevePlan {
  if (!existing) return fresh;
  const doneTitles = new Set(
    (existing.done ?? [])
      .map((n) => existing.etapes.find((e) => e.n === n))
      .filter((e): e is PlanEtape => !!e)
      .map((e) => normTitle(e.titre)),
  );
  const done = fresh.etapes.filter((e) => doneTitles.has(normTitle(e.titre))).map((e) => e.n);
  // (B1.1) Ne PAS reporter les blocages : re-planifier EST la façon de sortir d'un
  // blocage (on découpe autrement). Le nouveau plan repart donc sans étape bloquée
  // — c'est voulu : le signal a joué son rôle (inviter à re-planifier), on repart propre.
  return { ...fresh, done };
}

// ── Formateurs PURS ──────────────────────────────────────────────────────────

/** Affichage du plan avec cases à cocher + étape en cours (L18). PUR.
 *  (B1.1) Une étape BLOQUÉE s'affiche 🚫 et, s'il y en a, une ligne invite à
 *  re-planifier/contourner — visible uniquement si `blocked` est renseigné
 *  (donc jamais quand ELEVE_PLAN_V2 est off). */
export function formatPlan(plan: ElevePlan): string {
  const done = plan.done ?? [];
  const blocked = new Set(plan.blocked ?? []);
  const lines = [`📋 Plan — ${plan.titre}`, ""];
  for (const e of plan.etapes) {
    const mark = done.includes(e.n) ? "☑" : blocked.has(e.n) ? "🚫" : "☐";
    lines.push(`${mark} ${e.n}. ${e.titre}${e.detail ? ` — ${e.detail}` : ""}`);
  }
  const next = nextStep(plan);
  lines.push(
    "",
    next
      ? `→ Prochaine étape : ${next.n}. ${next.titre}. Fais-la, appelle check_build, puis coche-la avec etape_faite(${next.n}). ` +
          "Suis le plan dans l'ordre, n'oublie aucune étape ; finish seulement quand tout est coché et vert."
      : "→ Toutes les étapes sont cochées. Vérifie le build une dernière fois, puis appelle finish.",
  );
  if (hasBlocked(plan)) {
    lines.push(
      "🚫 Une ou plusieurs étapes sont BLOQUÉES. Ne tourne pas en rond : re-planifie (planifier) pour découper autrement " +
        "ou CONTOURNER l'obstacle, ou marque l'étape faite (etape_faite) si tu l'as finalement résolue.",
    );
  }
  return lines.join("\n");
}

/** Rappel COMPACT du plan (cases cochées + prochaine étape), réinjecté dans le
 *  nudge d'auto-relance — l'ancre qui remet sa PROGRESSION sous les yeux. PUR. */
export function formatPlanReminder(plan: ElevePlan): string {
  const done = plan.done ?? [];
  const blocked = new Set(plan.blocked ?? []);
  const etapes = plan.etapes
    .map((e) => `${done.includes(e.n) ? "☑" : blocked.has(e.n) ? "🚫" : "☐"}${e.n}. ${e.titre}`)
    .join(" · ");
  const next = nextStep(plan);
  const suite = next
    ? `→ Reprends à l'étape ${next.n}. ${next.titre} et termine les étapes non cochées (☐) — ne relâche pas avant que tout le plan soit livré.`
    : "→ Toutes les étapes sont cochées : vérifie le build et appelle finish.";
  // (B1.1) Signal de blocage réinjecté dans les rappels (donc dans les nudges
  // d'auto-relance) — sans toucher à la boucle : dès qu'une étape est bloquée,
  // tous les rappels invitent à re-planifier plutôt qu'à s'acharner.
  const blocage = hasBlocked(plan)
    ? "\n🚫 Étape(s) bloquée(s) : re-planifie (planifier) pour contourner, ne t'acharne pas dessus."
    : "";
  return `📋 Rappel de TON plan « ${plan.titre} » (${done.length}/${plan.etapes.length} fait) : ${etapes}\n${suite}${blocage}`;
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
