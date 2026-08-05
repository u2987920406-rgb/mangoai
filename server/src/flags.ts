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
  AXIOMS_DRIFT: {
    env: "AXIOMS_DRIFT",
    default: false,
    description: "Détecteur de contradiction/dérive à l'écriture d'un axiome (consigne les paires suspectes pour le reviewer nocturne, ne supprime jamais).",
  },
  AXIOMS_VALIDATION: {
    env: "AXIOMS_VALIDATION",
    default: false,
    description: "Validation MÉCANIQUE avant promotion d'un axiome (reviewToAxioms) en mémoire durable : dédup sémantique (embeddings + cosinus, seuil DRIFT_THRESHOLD) contre le registre confirmé → un quasi-doublon n'est pas injecté (consigné dans .axioms-conflicts.md) + quarantaine (.axioms-quarantine.json, compteur de confirmations) avant promotion dans .axioms.md. OFF → append historique byte-identique (0 embedding, 0 I/O de quarantaine).",
  },
  // ── Pilier C — liquidité de cerveau ─────────────────────────────────────
  BRAIN_LOCAL_ONLY: {
    env: "BRAIN_LOCAL_ONLY",
    default: false,
    description: "« Rideau de fer » souveraineté : force localOnly=true sur TOUS les rôles → le garde de dispatch refuse tout provider cloud. À activer le jour où un modèle local tient la boucle (mur L51).",
  },
  // ── MangoQA — autorité d'arrêt du Disjoncteur (Visage 1) ─────────────────
  MANGOQA_STOP_AUTHORITY: {
    env: "MANGOQA_STOP_AUTHORITY",
    default: false,
    description: "Autorité d'arrêt réelle du Disjoncteur MangoQA : la boucle nocturne LIT breaker-verdict.json entre deux projets et s'arrête elle-même si safe:false (jamais MangoQA qui agit). OFF → verdict ignoré (comportement historique, byte-identique).",
  },
  // ── #180 É2 — périmètre d'action (interface de bureau autonome) ──────────
  DESKTOP_PERIMETER: {
    env: "DESKTOP_PERIMETER",
    default: false,
    description: "Périmètre d'action élargi CONTRÔLÉ (#180 D3/D4) : branche perimeter.ts dans les outils fichiers/commandes. ON → un chemin est confiné à l'UNION des racines consenties (workspace + coffres grantés data/desktop-grants.json), filtrée par acteur (interactif = coffres au mode granté ; autonome = workspace-only, coffres en ro SEULEMENT si les 3 garde-fous MANGOQA_STOP_AUTHORITY+NOCTURNAL_BUDGET_HARD+NOCTURNAL_QA_BUS sont armés, fail-safe sinon). OFF (défaut) → une seule racine = le projet, byte-identique au resolveInside historique (aucun chargement de grants, aucune I/O).",
  },
  // ── #180 É6 — palier système gaté (interface de bureau autonome) ────────
  DESKTOP_SYSTEM_SHELL: {
    env: "DESKTOP_SYSTEM_SHELL",
    default: false,
    description: "Palier système (#180 D5/É6, eleve-system-tools.ts) : commandes système élargies (familles nommées, approuvées une fois par session) + outils déterministes open_folder/reveal_in_explorer/open_url. INTERACTIF SEULEMENT — refus INCONDITIONNEL si l'acteur courant (currentActor()) est 'autonomous', quel que soit ce gate (fail-safe D4/D7, pas une option). Au-dessus du plancher inviolable FORBIDDEN_RUN (executor.ts), jamais affaibli. OFF (défaut) → aucun de ces outils n'est enregistré dans le registre Élève, comportement byte-identique.",
  },
  // ── #180 É7 — scheduler borné multi-projets (note : pas un booléen ────────
  // ici, contrairement aux autres entrées de ce registre — voir agent-scheduler.ts).
  // DESKTOP_MAX_CONCURRENT_RUNS (numérique, défaut 1) : taille du pool de runs
  // agentiques autorisés EN VOL simultanément (schedulerConfig()). Défaut 1 =
  // comportement équivalent au verrou global historique (agent-lock.ts, non
  // modifié). Même patron que NOCTURNAL_GLOBAL_BUDGET_USD/CRON_MAX_RUNS_PER_HOUR :
  // lu directement via process.env dans agent-scheduler.ts (pas un FlagSpec
  // booléen), documenté ICI pour rester repérable au même endroit que le reste
  // des gates DESKTOP_*.
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
  // (Audit d'allègement 2026-07-24) SAVOIR_RUNNER retiré : le flag gatait `run-savoir.ts`,
  // un fichier qui N'A JAMAIS ÉTÉ CONSTRUIT (vérifié : absent du disque, zéro référence dans
  // tout le repo). Fantôme pur — les 3 modules savoir réels (extraction/reconcile/transcript)
  // gardent leurs propres flags ci-dessus. Le sous-système #177 reste à moitié câblé (décision
  // ── L114/L116 (limites.md) — volet IMAGES du Gardien de clôture ───────────
  // (#196 fault-finding, plan cohérence de contenu, 2026-07-24) — ACTIVÉ par défaut :
  // déjà 34 tests verts, fail-open par construction, byte-identique en cas de capture/
  // réponse VL indisponible. La sonde de cette nuit a confirmé que ce volet reste le
  // SEUL mécanisme de l'écosystème (MangoOS + MangoQA) qui vérifie la correspondance
  // ── L117 (limites.md) — volet CONSTANTES du Gardien de clôture ────────────
  // (#196 fault-finding, plan cohérence de contenu, 2026-07-24) — ACTIVÉ par défaut,
  // même raisonnement que ELEVE_GATE_IMAGES ci-dessus (34 tests verts, fail-open,
  // ── #196 fault-finding, plan cohérence de contenu — volet CONTENU du Gardien ──
  // Contrairement à IMAGES/CONSTANTES ci-dessus (34+34 tests ET l'incident déclencheur
  // exact derrière eux avant même d'être activés), ce volet est NEUF — jamais éprouvé en
  // réel. Reste OFF par défaut plus longtemps (même logique de montée en confiance que
  // ── #193 — Section « Code » (2026-07-21, demande Raf) ─────────────────────
  CODE_SECTION: {
    env: "CODE_SECTION",
    default: false,
    description: "Section « Code » (docs/plan-193-section-code.md) : chat agentique frontière-only sur des projets LOCAUX EXTERNES au workspace MangoOS — distinct de l'Accueil (léger, cerveau rapide) et du Builder (workspace, souverain). OFF (défaut) → /api/code-chat et /api/external-projects renvoient 403/réponses inertes, nav UI affiche un état désactivé explicite. Aucun effet sur /api/chat, /api/home-chat, workspace/ ou projects.ts.",
  },
  // ── Dette du lot 2 (2026-08-05) : ces deux gates étaient lus via process.env
  //    SANS figurer ici — la règle en tête de ce fichier était enfreinte. Ils sont
  //    déclarés pour rendre la décision VISIBLE ; leur sort produit reste à trancher.
  ELEVE_GATE_TASTE_OBSERVE: {
    env: "ELEVE_GATE_TASTE_OBSERVE",
    default: true,
    description: "Volet GOÛT du Gardien en mode OBSERVATION (défaut) : le score de goût est rapporté mais ne bloque JAMAIS la clôture. OFF → il bloque sous le seuil (ELEVE_GATE_TASTE_MIN). À trancher : un auditeur qui ne bloque jamais sur le goût est-il un auditeur ? Le figer ON retirerait au Gardien sa capacité de blocage esthétique — décision produit, pas nettoyage.",
  },
  ELEVE_GATE_TESTS: {
    env: "ELEVE_GATE_TESTS",
    default: false,
    description: "Le Gardien EXÉCUTE réellement le script `test` du projet à la clôture. OFF (défaut, jamais allumé) → il se contente de DÉCLARER le manque (« un script test réel existe mais n'est pas exécuté à la clôture »), ce qui est honnête mais faible. ON → la clôture lance vraiment les tests : plus lent, et peut bloquer. Se tranche sur un vrai tour de build, pas au jugé.",
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
