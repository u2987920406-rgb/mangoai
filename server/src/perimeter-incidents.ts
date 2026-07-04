// #180 É6/D7 — Extension des entrées du Disjoncteur : source de signal LOCALE (le
// process serveur courant) qui vient S'AJOUTER au verdict FICHIER de MangoQA
// (breaker-verdict.json, mangoqa.ts), SANS changer le contrat de `decideBreakerStop`
// (nocturnal.ts, INCHANGÉ ici). Deux natures d'incident, les deux triggers de D7 :
//   • "out-of-perimeter"              — une tentative de chemin hors des racines
//     consenties (D3/D4), refusée par `confinePath` (perimeter-context.ts).
//   • "forbidden-command-autonomous" — une commande de la blacklist FORBIDDEN_RUN
//     (executor.ts) ou du palier système (eleve-system-tools.ts) tentée alors que
//     `currentActor()==='autonomous'`.
//
// Conforme à fondation.md §V : MangoQA reste un FANTÔME, il n'écrit QUE ses propres
// verdicts et n'est jamais consulté ici. Cette source est un signal LOCAL et
// déterministe (zéro LLM, zéro process externe) — MangoOS observe SA PROPRE
// tentative refusée et décide, lui-même, de s'arrêter à la frontière suivante.

import type { BreakerVerdictResult, BreakerTripLite } from "./mangoqa.js";

export type PerimeterIncidentKind = "out-of-perimeter" | "forbidden-command-autonomous";

export interface PerimeterIncident {
  kind: PerimeterIncidentKind;
  detail: string;
  at: number;
}

// En mémoire, PAR PROCESS — comme le verrou agentique (agent-lock.ts) : la boucle
// nocturne tourne dans un seul process serveur, donc un incident émis PENDANT le lot
// est visible par `decideBreakerStop` à la frontière suivante DANS LE MÊME process.
// Pas de persistance disque : pas de besoin de survivre à un redémarrage (un crash
// redescend de toute façon au fail-safe périmètre — perimeter.ts).
let incidents: PerimeterIncident[] = [];

/** Enregistre un incident de périmètre/commande. Jamais bloquant, jamais de throw. */
export function recordPerimeterIncident(kind: PerimeterIncidentKind, detail: string): void {
  incidents.push({ kind, detail, at: Date.now() });
}

/** Liste défensive (copie) des incidents accumulés depuis le dernier `clear`. */
export function listPerimeterIncidents(): PerimeterIncident[] {
  return incidents.slice();
}

/** Remet à zéro les incidents (tests ; et à la frontière d'un nouveau lot nocturne). */
export function clearPerimeterIncidents(): void {
  incidents = [];
}

/**
 * Combine le verdict FICHIER de MangoQA (readBreakerVerdict, INCHANGÉ) avec les
 * incidents LOCAUX de périmètre. PURE : ne lit rien, ne touche pas au disque — reçoit
 * le verdict de base et la liste d'incidents en argument, renvoie un nouveau verdict.
 *
 * Ne change PAS le contrat de `decideBreakerStop` (nocturnal.ts) : celui-ci continue de
 * recevoir un simple thunk `() => BreakerVerdictResult`. Cette fonction enrichit ce que
 * le thunk renvoie, EN AMONT de decideBreakerStop — decideBreakerStop lui-même n'a pas
 * besoin de connaître l'existence des incidents de périmètre.
 *
 * Aucun incident → le verdict de base ressort inchangé (0 allocation superflue, même
 * référence de contenu). Au moins un incident → toujours `safe:false` (un incident de
 * périmètre est TOUJOURS un motif d'arrêt, qu'il coexiste ou non avec un verdict
 * MangoQA absent/sûr) et ses trips sont concaténés à ceux déjà présents.
 */
export function combineBreakerVerdict(
  base: BreakerVerdictResult,
  incidents: readonly PerimeterIncident[],
): BreakerVerdictResult {
  if (incidents.length === 0) return base;
  const trips: BreakerTripLite[] = incidents.map((i) => ({
    breaker: "perimeter",
    action: "stop",
    reason: `${i.kind} : ${i.detail}`,
  }));
  if (base.available) {
    return {
      available: true,
      safe: false,
      trips: [...base.trips, ...trips],
      evaluatedAt: base.evaluatedAt,
    };
  }
  return { available: true, safe: false, trips, evaluatedAt: Date.now() };
}
