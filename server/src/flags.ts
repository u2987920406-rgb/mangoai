// Registre CENTRAL des drapeaux de fonctionnalité (gates) de MangoOS.
//
// Pourquoi ce module (chantier « Fondations harnais dernière génération »,
// 2026-07-03) : les capacités nouvelles s'activent par variable d'environnement,
// défaut OFF (rétrocompatibilité stricte). Éparpillées, ces lectures de
// `process.env` deviennent inauditables sur 10 ans. On les CENTRALISE ici :
// une seule source de vérité, un nom + une valeur par défaut + une description
// par gate, et un helper de dump pour les diagnostiquer d'un coup.
//
// Règle : un gate ne CHANGE JAMAIS le comportement quand il est OFF. Les
// corrections de robustesse pure (atomicité, versioning) n'ont PAS de gate —
// elles ne modifient aucune sémantique observable.
//
// Lecture PARESSEUSE (à l'appel), pas au chargement du module : les tests et la
// config .env peuvent muter `process.env` avant le premier usage réel.

/** Un flag booléen piloté par env, défaut explicite, décrit pour l'audit. */
export interface FlagSpec {
  /** Nom de la variable d'environnement (ex. "ELEVE_MEMOIRE"). */
  env: string;
  /** Valeur par défaut si la variable est absente. */
  default: boolean;
  /** À quoi sert ce gate (une phrase). */
  description: string;
}

/**
 * Catalogue des gates du chantier fondations. On y ajoute chaque nouveau flag
 * au fil des items — jamais un `process.env.X === "on"` dispersé ailleurs.
 */
export const FLAGS = {
  // ── Pilier A — mémoire ──────────────────────────────────────────────────
  AXIOMS_ROTATE: {
    env: "AXIOMS_ROTATE",
    default: false,
    description: "Rotation du registre d'axiomes : au-delà du cap, archive le surplus dans .axioms.archive.md au lieu de le couper en silence.",
  },
  BLACKBOARD_TTL: {
    env: "BLACKBOARD_TTL",
    default: false,
    description: "Purge/TTL du Blackboard SQLite (prune des artefacts trop vieux / au-delà d'un maximum).",
  },
  MEMORY_MANIFEST: {
    env: "MEMORY_MANIFEST",
    default: false,
    description: "Écrit/maintient .memory-manifest.json (versions de schéma des magasins fichiers). Lecture toujours fail-open.",
  },
  ELEVE_MEMOIRE: {
    env: "ELEVE_MEMOIRE",
    default: false,
    description: "Rappel sémantique du Blackboard DANS la boucle : injection proactive de souvenirs pertinents + outil memoire_rappel.",
  },
  AXIOMS_DRIFT: {
    env: "AXIOMS_DRIFT",
    default: false,
    description: "Détecteur de contradiction/dérive à l'écriture d'un axiome (consigne les paires suspectes pour le reviewer nocturne, ne supprime jamais).",
  },
  // ── Pilier B — boucle cognitive ─────────────────────────────────────────
  ELEVE_ETAT: {
    env: "ELEVE_ETAT",
    default: false,
    description: "Maintient un « état de travail » compact (objectif/fichiers écrits/plan/blocage) réinjecté quand la compaction tronque le contexte.",
  },
  ELEVE_RESUME: {
    env: "ELEVE_RESUME",
    default: false,
    description: "Snapshot de reprise (.eleve-run.json) écrit à chaque frontière d'itération et restauré après interruption (TTL borné).",
  },
  ELEVE_PLAN_V2: {
    env: "ELEVE_PLAN_V2",
    default: false,
    description: "Plan structuré re-planifiable (statuts d'étapes) au lieu du simple rappel-texte ; suggère une replanification sur blocage.",
  },
  ELEVE_REFLEXION: {
    env: "ELEVE_REFLEXION",
    default: false,
    description: "Phase de réflexion explicite (un tour sans outils) périodique ou après un blocage, bornée par run.",
  },
  // ── Pilier C — liquidité de cerveau ─────────────────────────────────────
  BRAIN_LOCAL_ONLY: {
    env: "BRAIN_LOCAL_ONLY",
    default: false,
    description: "« Rideau de fer » souveraineté : force localOnly=true sur TOUS les rôles → le garde de dispatch refuse tout provider cloud. À activer le jour où un modèle local tient la boucle (mur L51).",
  },
  BRAIN_FALLBACK: {
    env: "BRAIN_FALLBACK",
    default: false,
    description: "Fallback AUTOMATIQUE inter-providers : sur timeout/erreur transport d'un rôle, bascule vers la chaîne `fallback` déclarée dans son registre (garde localOnly préservée, $0 abonnement Claude préservé).",
  },
  BRAIN_ENSEMBLE: {
    env: "BRAIN_ENSEMBLE",
    default: false,
    description: "Ensemble/vote : pour une décision critique, N modèles répondent et un agrégateur tranche (majorité/juge). Mécanisme d'avenir, gaté + champ `ensemble` requis (double verrou).",
  },
  // ── MangoQA — autorité d'arrêt du Disjoncteur (Visage 1) ─────────────────
  MANGOQA_STOP_AUTHORITY: {
    env: "MANGOQA_STOP_AUTHORITY",
    default: false,
    description: "Autorité d'arrêt réelle du Disjoncteur MangoQA : la boucle nocturne LIT breaker-verdict.json entre deux projets et s'arrête elle-même si safe:false (jamais MangoQA qui agit). OFF → verdict ignoré (comportement historique, byte-identique).",
  },
  // ── Pilier D — finition (clôture) ───────────────────────────────────────
  ELEVE_CLOSURE_GATE: {
    env: "ELEVE_CLOSURE_GATE",
    default: false,
    description: "Gardien de clôture (intention+goût+QA) avant de finir un tour. Défaut OFF pour compat historique — MEMORY du projet dit 'toujours actif', d'où l'avertissement si absent au boot des runners nocturnes.",
  },
  // ── Nocturne — fabrique QA + budget-$ dur (revue globale 2026-07-03) ─────
  NOCTURNAL_QA_BUS: {
    env: "NOCTURNAL_QA_BUS",
    default: false,
    description: "Branche la boucle nocturne (Phase 1/2, nocturnal.ts) sur la fabrique QA : émet chat.turn (Bus — cost/turns/durationMs, comme kernel-chat-bridge.ts pour le chat interactif) + un phase-complete (mangoqa.ts) par projet généré. OFF → génération inchangée, AUCUN événement émis (comportement historique, byte-identique).",
  },
  NOCTURNAL_BUDGET_HARD: {
    env: "NOCTURNAL_BUDGET_HARD",
    default: false,
    description: "Budget-$ DUR partagé entre Phase 0 (train-loop), Phase 1 (run-tonight/run-mango-nuit) et Phase 2 (nocturnal) : arrêt NET à la frontière d'itération (jamais en cours de génération) si le cumul dépensé (ledger partagé data/global-budget.json, fenêtre = la nuit courante) dépasse NOCTURNAL_GLOBAL_BUDGET_USD ($0/absent = illimité, mêmes conventions que FINISH_BUDGET_USD). OFF → l'état n'est jamais lu, 0 I/O, comportement historique.",
  },
} as const satisfies Record<string, FlagSpec>;

export type FlagName = keyof typeof FLAGS;

/** Vrai si le gate est actif. Convention d'activation : "on" | "1" | "true"
 *  (insensible à la casse). Toute autre valeur = OFF ; absence = valeur par défaut. */
export function flag(name: FlagName): boolean {
  const spec = FLAGS[name];
  const raw = process.env[spec.env];
  if (raw === undefined) return spec.default;
  return /^(on|1|true|yes)$/i.test(raw.trim());
}

/** Dump de l'état de tous les gates (diagnostic /debug, jamais un secret). */
export function flagsSnapshot(): Array<{ name: FlagName; env: string; active: boolean; default: boolean; description: string }> {
  return (Object.keys(FLAGS) as FlagName[]).map((name) => {
    const spec = FLAGS[name];
    return { name, env: spec.env, active: flag(name), default: spec.default, description: spec.description };
  });
}
