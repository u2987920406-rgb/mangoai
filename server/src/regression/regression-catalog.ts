// Catalogue de régression (#196 fault-finding Partie 5, plan run-login-cached-noodle.md).
//
// Index — PAS une réimplémentation — des incidents RÉELS déjà documentés dans
// `historique.md`/la mémoire du projet, et du test qui les regression-lock
// aujourd'hui. Objectif : une seule question, une seule réponse honnête —
// « cet incident déjà vécu peut-il resurgir sans qu'un test ne le voie ? ».
// `status:"gap"` = AUCUN test dédié ne le protège aujourd'hui — signalé
// explicitement, jamais silencieux (axiome établi cette session : pas de
// couverture qui a l'air de vérifier sans vérifier).
export interface RegressionEntry {
  id: string;
  date: string;
  incident: string;
  guardedBy: string[];
  status: "guarded" | "gap";
  /** Pourquoi ce statut, pour qu'un futur audit sache s'il est encore à jour. */
  note: string;
}

export const REGRESSION_CATALOG: RegressionEntry[] = [
  {
    id: "datadir-divergence",
    date: "2026-07-23",
    incident: "server/data/ vs server/src/data/ divergeaient silencieusement (4 patrons de résolution de chemin incompatibles) — 10 agents spécialistes réellement forgés invisibles du système vivant.",
    guardedBy: ["safe-io.ts::dataDir() — point de résolution unique, tous les stores globaux migrés"],
    status: "guarded",
    note: "Pas un test au sens strict — une refonte structurelle qui rend la classe de bug impossible (un seul point de résolution, ancré sur safe-io.ts lui-même).",
  },
  {
    id: "agent-factory-chemin-casse",
    date: "2026-07-23",
    incident: "agent-factory.ts résolvait vers server/server/data/... (double segment) — loadAgentRegistry() renvoyait toujours [] sans erreur visible.",
    guardedBy: ["test-agent-factory-e2e.ts"],
    status: "guarded",
    note: "Corrigé en Partie 0 ; vérifié en réel (round-trip Agent Factory) le jour même.",
  },
  {
    id: "esthete-race-boot",
    date: "2026-07-23",
    incident: "ensureEstheteAgent() faisait un load-merge-save complet à CHAQUE boot — chevauchement de process tsx watch a fait tomber le registre de 11 agents à 1 seule entrée, deux fois pendant la même session.",
    guardedBy: ["test-esthete-agent.ts (checks « survit à un re-seed »)"],
    status: "guarded",
    note: "Root-cause trouvée EN DIRECT pendant la session (pas en théorie) — devient un no-op si le contenu n'a pas changé.",
  },
  {
    id: "forging-bloque-sans-reprise",
    date: "2026-07-23",
    incident: "Une lacune passée à \"forging\" (auto-évolution) qui crashait avant de résoudre restait bloquée à \"forging\" pour toujours — jamais retentée automatiquement.",
    guardedBy: ["test-self-evolution.ts::reconcileStuckForging"],
    status: "guarded",
    note: "Réconciliation au boot (>10 min) — testé avec un cas frais (1 min, PAS réconcilié) et un cas périmé (15 min, réconcilié).",
  },
  {
    id: "verrou-avant-travail-taste-nocturnal",
    date: "2026-07-23",
    incident: "taste-nocturnal.ts posait lastAutoRun AVANT le lot, pas après — un crash pendant le lot perdait la nuit ET bloquait toute reprise jusqu'au lendemain.",
    guardedBy: ["test-taste-nocturnal.ts (scénario crash simulé)"],
    status: "guarded",
    note: "Même anti-pattern retrouvé et corrigé en parallèle dans nocturnal.ts (pas de test dédié — fonction privée, confiance par analogie directe, cf. historique.md suite 9).",
  },
  {
    id: "cron-sauvegarde-en-bloc",
    date: "2026-07-23",
    incident: "cron-scheduler.ts sauvegardait tous les résultats en UN SEUL appel après la boucle entière — un crash sur la tâche 2/3 perdait même le résultat de la tâche 1 déjà réussie.",
    guardedBy: ["test-cron-scheduler.ts"],
    status: "guarded",
    note: "saveTaskResult() sauvegarde par tâche ; testé avec un crash simulé pile entre deux tâches.",
  },
  {
    id: "tsx-watch-pas-de-relance",
    date: "2026-07-23",
    incident: "tsx watch ne relance PAS le backend après un SIGKILL (seulement sur changement de fichier) — un vrai crash laissait le backend mort jusqu'à une relance manuelle.",
    guardedBy: ["test-watchdog-core.ts", "chaos-runner.ts (crash réel + relance réelle)"],
    status: "guarded",
    note: "Patron répliqué de MangoQA (déjà prouvé en prod, 2 crashs absorbés). Testé avec un vrai SIGKILL en Partie 3 ET dans la sonde de chaos.",
  },
  {
    id: "relay-config-deps-askeleve-bypass",
    date: "2026-07-21",
    incident: "Le correctif hy3:free avait rendu callAskEleve inconditionnellement égal à un vrai appel réseau — deps.askEleve (mock d'injection) n'était plus jamais utilisé, cassant l'isolation réseau de TOUT le chemin contrat (8 échecs test-relay.ts).",
    guardedBy: ["test-relay.ts", "test-specialized-agents.ts", "test-nocturnal-repair.ts"],
    status: "guarded",
    note: "Les 3 consommateurs de RelayDeps sont couverts — régression trouvée ET corrigée le jour même via ces suites.",
  },
  {
    id: "chat-history-flush-fin-de-tour",
    date: "2026-07-23",
    incident: "`.chat-history.json` n'était persisté qu'UNE FOIS en toute fin de tour — Raf qui revenait en cours de route voyait l'état d'AVANT le tour, donnant l'illusion d'un arrêt (le backend, lui, continuait réellement de tourner).",
    guardedBy: [],
    status: "gap",
    note: "Corrigé (flush incrémental throttlé 3s dans chat-route.ts), vérifié EN RÉEL le jour même, mais AUCUN test automatisé dédié aujourd'hui — chat-route.ts est un gros fichier SSE, pas encore couvert par le patron déterministe (deps injectées) utilisé ailleurs. Gap honnête, pas comblé cette nuit (surface trop large pour un test sûr sous contrainte de temps — mieux vaut le signaler que fabriquer un test de façade).",
  },
  {
    id: "terme-ambigu-discuter",
    date: "2026-07-22",
    incident: "Mode Discuter cherchait un terme générique sans demander de précision (« Open Design » → résultat hors-sujet au lieu du site réellement visé par Raf).",
    guardedBy: ["test-scenario.ts"],
    status: "guarded",
    note: "Garde-fou « terme ambigu » ajouté à DISCUSS_RULES, rejoué avec le message exact de Raf contre le vrai backend.",
  },
];

export function catalogSummary(): { total: number; guarded: number; gaps: number } {
  const guarded = REGRESSION_CATALOG.filter((e) => e.status === "guarded").length;
  return { total: REGRESSION_CATALOG.length, guarded, gaps: REGRESSION_CATALOG.length - guarded };
}
