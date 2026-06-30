// Exécution agentique SPÉCULATIVE (#171) — transposition du *speculative decoding* (cf. DeepSpec) du
// niveau TOKEN au niveau ACTION. Au lieu d'alterner « cerveau fort → 1 étape → observe → cerveau fort »,
// un cerveau FRUGAL drafte une SÉQUENCE d'étapes d'un coup ; on les exécute et on ACCEPTE le plus long
// préfixe valide ; au PREMIER point de divergence on rend la main (escalade / replanification). Quand
// l'acceptation est haute, on économise des tours du cerveau fort (→ plus de souveraineté, moins de coût).
//
// ⚠️ Les étapes à EFFET DE BORD (écritures, build) doivent être spéculées dans une COPIE ISOLÉE
// (git worktree, déjà utilisé par l'auto-amélioration) puis appliquées une fois le préfixe accepté.
// Ce module est le NOYAU PUR de décision : exécuteur et vérificateur sont injectés, il ne lève jamais.

export interface SpecStep<T = unknown> {
  label: string;
  payload?: T;
}

export interface StepOutcome {
  ok: boolean;
  detail?: string;
}

export interface SpeculativeDeps<T> {
  /** exécute une étape draftée → son résultat (réversible / en bac à sable de préférence) */
  execute(step: SpecStep<T>, index: number): Promise<StepOutcome> | StepOutcome;
  /** valide le résultat (déterministe : build vert ? fichier écrit ? — ou juge frugal) */
  verify(step: SpecStep<T>, outcome: StepOutcome, index: number): Promise<boolean> | boolean;
}

export interface SpeculativeResult<T> {
  drafted: number;
  accepted: number; // longueur du préfixe accepté
  divergedAt: number | null; // index du 1er rejet (null si tout accepté)
  acceptedSteps: SpecStep<T>[];
  outcomes: StepOutcome[]; // étapes exécutées (jusqu'à la divergence incluse)
  acceptanceRatio: number; // accepted / drafted (0 si vide)
  savedRoundTrips: number; // tours du cerveau fort économisés vs exécution séquentielle (conservateur : accepted-1)
}

export async function runSpeculative<T>(
  draft: SpecStep<T>[],
  deps: SpeculativeDeps<T>,
): Promise<SpeculativeResult<T>> {
  const outcomes: StepOutcome[] = [];
  const acceptedSteps: SpecStep<T>[] = [];
  let divergedAt: number | null = null;

  for (let i = 0; i < draft.length; i++) {
    let outcome: StepOutcome;
    try {
      outcome = await deps.execute(draft[i], i);
    } catch (e) {
      outcome = { ok: false, detail: e instanceof Error ? e.message : String(e) };
    }
    outcomes.push(outcome);

    let pass: boolean;
    try {
      pass = outcome.ok ? await deps.verify(draft[i], outcome, i) : false;
    } catch {
      pass = false; // un vérificateur qui plante = rejet (jamais d'exception qui remonte)
    }

    if (!pass) {
      divergedAt = i;
      break; // on n'exécute PAS la suite : elle dépendait d'un état désormais invalide
    }
    acceptedSteps.push(draft[i]);
  }

  const accepted = acceptedSteps.length;
  const drafted = draft.length;
  return {
    drafted,
    accepted,
    divergedAt,
    acceptedSteps,
    outcomes,
    acceptanceRatio: drafted > 0 ? accepted / drafted : 0,
    savedRoundTrips: accepted > 0 ? accepted - 1 : 0,
  };
}

// ── Profondeur adaptative (comme on règle la longueur du draft en spec-decoding) ───────────────

export interface DepthPolicy {
  min: number;
  max: number;
}

/**
 * Ajuste la profondeur de spéculation d'après l'acceptation du dernier lot :
 * acceptation haute → on ose plus long (+1) ; basse → on raccourcit (÷2). Borné par la politique.
 */
export function nextDepth(currentDepth: number, lastRatio: number, policy: DepthPolicy): number {
  let d = currentDepth;
  if (lastRatio >= 0.75) d = currentDepth + 1;
  else if (lastRatio < 0.4) d = Math.ceil(currentDepth / 2);
  return Math.max(policy.min, Math.min(policy.max, d));
}

/** Ligne de log lisible pour un lot spéculatif. */
export function summarizeSpeculation<T>(r: SpeculativeResult<T>): string {
  const pct = Math.round(r.acceptanceRatio * 100);
  const diverge = r.divergedAt === null ? "tout accepté" : `divergence à l'étape #${r.divergedAt}`;
  return `Spéculation : ${r.accepted}/${r.drafted} acceptées (${pct}%), ${diverge}, ${r.savedRoundTrips} tour(s) économisé(s).`;
}
