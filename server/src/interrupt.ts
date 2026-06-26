// Signal d'interruption coopératif du tour de chat.
//
// LE PROBLÈME — `interruptAgent()` (agent.ts) ne sait arrêter QUE le SDK Claude
// (`query().interrupt()`). Or le chemin par défaut est l'Élève (GLM via Ollama
// Cloud) dont la boucle agentique tourne dans `runRelay`/`buildAgentic` : un clic
// « Stop » ne l'arrêtait pas → l'utilisateur devait attendre la fin d'une requête
// partie de travers (parfois longue et coûteuse).
//
// LA PARADE — un drapeau d'interruption coopératif, à grain de boucle. `/api/stop`
// l'arme (`requestInterrupt`) ; la boucle Élève le lit entre deux itérations
// (`isInterrupted`) et sort PROPREMENT (le travail déjà écrit est committé par le
// tour, donc « reprendre là où on en était » = renvoyer un message). Le début de
// chaque tour le remet à zéro (`clearInterrupt`).
//
// Un seul drapeau module-niveau suffit : le verrou `agentBusy` garantit un seul
// tour de chat à la fois. Coopératif (pas de kill brutal) → aucun état corrompu :
// on s'arrête sur une frontière d'itération, jamais au milieu d'une écriture.

let interrupted = false;

/** Demande l'arrêt du tour en cours (appelé par /api/stop). */
export function requestInterrupt(): void {
  interrupted = true;
}

/** Remet le drapeau à zéro (appelé au début de chaque tour de chat). */
export function clearInterrupt(): void {
  interrupted = false;
}

/** L'utilisateur a-t-il demandé l'arrêt ? Lu en tête de boucle agentique. */
export function isInterrupted(): boolean {
  return interrupted;
}
