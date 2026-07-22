// #140 — Navigation : source de vérité UNIQUE des identifiants d'écrans et de
// fenêtres du cockpit. Avant, ces chaînes (`setScreen("workspace")`,
// `type: "launcher"`) étaient éparpillées et « stringly-typed » → une faute de
// frappe = un écran fantôme (la classe de bug que l'Auditeur de Flux #137
// rattrape APRÈS coup). Ici on les centralise : un seul endroit à lire, et des
// gardes (`isScreen`/`isWindowType`) pour valider à l'exécution ce que le JS ne
// vérifie pas à la compilation.

/** Écrans plein-cadre pilotés par `setScreen` dans App.jsx. */
export const SCREENS = Object.freeze({
  HOME: "home",
  WORKSPACE: "workspace",
  CONTROLEUR: "controleur",
  METRICS: "metrics",
  REGLAGES: "reglages",
  // #193 — section Code : chat agentique frontière-only sur des projets locaux
  // externes au workspace. Voir docs/plan-193-section-code.md.
  CODE: "code",
});

/** Types de fenêtres flottantes ouvertes via `openWindow({ type })`. */
export const WINDOWS = Object.freeze({
  PROJECTS: "projects",
  SUITE: "suite",
  ARTIFACTS: "artifacts",
  GUIDE: "guide",
  IDEATION: "ideation",
  NOTES: "notes",
  DOCS: "docs",
  PROMPTLAB: "promptlab",
  DESIGN: "design",
  MULTI: "multi",
  SUPERAGENT: "superagent",
  AGENT_FACTORY: "agent-factory",
  IMAGE_CREATOR: "image-creator",
  MUSIC_CREATOR: "music-creator",
  TASTE: "taste",
});

const SCREEN_VALUES = Object.freeze(Object.values(SCREENS));
const WINDOW_VALUES = Object.freeze(Object.values(WINDOWS));

/** Liste figée des écrans connus (pour itérer / valider). */
export function screenValues() {
  return SCREEN_VALUES;
}

/** Liste figée des types de fenêtres connus. */
export function windowValues() {
  return WINDOW_VALUES;
}

/** Garde : `s` est-il un écran connu ? (détecte un écran fantôme à l'exécution.) */
export function isScreen(s) {
  return SCREEN_VALUES.includes(s);
}

/** Garde : `t` est-il un type de fenêtre connu ? */
export function isWindowType(t) {
  return WINDOW_VALUES.includes(t);
}
