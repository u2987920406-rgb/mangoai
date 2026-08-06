// Refonte v3 — le socle. Point d'entrée UNIQUE.
//
// Tout ce qui veut parler aux équipes importe d'ici, jamais des fichiers internes.
// C'est ce qui rendra vérifiable, au lot 6, la règle du lot 3 : « tout appel LLM du
// produit passe par v3/ ». Un import direct de `brain-dispatch` ailleurs devient
// alors un écart visible, et non une habitude invisible.

export {
  TEAMS,
  TEAM_IDS,
  getTeam,
  teamCapabilities,
  teamOwningTool,
  outilsOrphelins,
  outilsFantomes,
  type Team,
  type TeamId,
  type Ignition,
} from "./teams.js";

export {
  dispatchTeam,
  teamToolPolicy,
  TeamBudget,
  budgetEquipes,
  type TeamDispatchOpts,
  type TeamResult,
} from "./team-dispatch.js";

export {
  allumage,
  allumageSync,
  equipesAllumees,
  equipesPourCapacites,
  observeAllumage,
  capacitesSansEquipe,
} from "./team-ignition.js";

export {
  runTour,
  resultatDuTour,
  type TourOpts,
  type TourResult,
} from "./team-run.js";

export {
  TeamJournal,
  journalEquipes,
  type EntreeJournal,
  type EtatEquipe,
} from "./team-journal.js";
