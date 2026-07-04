// #180 É2 — Pont entre le noyau de périmètre PUR (perimeter.ts, É1) et les
// OUTILS réels (executor.ts + eleve-*-tools.ts). Deux responsabilités :
//
//   (1) CONTEXTE D'ACTEUR (D4 « le périmètre suit le pilote ») — quel acteur
//       invoque un outil ? `interactive` (Raf présent, chat) ou `autonomous`
//       (nuit/cron/Stratège/tuteur). Propagé par AsyncLocalStorage : le point
//       d'entrée d'un run (buildAgentic, ou un runner nocturne) établit l'acteur
//       UNE fois, et TOUS les handlers d'outils appelés dans la boucle — aussi
//       profonds soient-ils (sous-agents délégués compris) — le lisent sans
//       qu'on ait à le fauffiler à travers ~26 signatures. Défaut `interactive`
//       (aucun contexte posé = chat = comportement historique).
//
//   (2) CONFINEMENT GATÉ — `confinePath(root, rel, access)` remplace les ~9
//       copies locales de `resolveInside`. Gate DESKTOP_PERIMETER OFF (défaut) →
//       comportement BYTE-IDENTIQUE au resolveInside historique (une racine = le
//       projet, même prédicat, même message d'erreur). ON → union des racines
//       consenties, filtrée par acteur (perimeter.ts) et par mode d'accès.
//
// FAIL-SAFE (gate de POUVOIR, pas de qualité) : dans le doute on REDESCEND au
// workspace. Le noyau perimeter.ts (non modifié ici) porte déjà toute la logique.

import { AsyncLocalStorage } from "node:async_hooks";
import path from "node:path";
import { flag } from "./flags.js";
import { recordPerimeterIncident } from "./perimeter-incidents.js";
import {
  resolveInsideAny,
  resolvePerimeter,
  perimeterRoots,
  loadGrants,
  readPerimeterFlags,
  type Actor,
  type Perimeter,
} from "./perimeter.js";

export type { Actor } from "./perimeter.js";

// ── (1) Contexte d'acteur (AsyncLocalStorage) ────────────────────────────────

const actorStore = new AsyncLocalStorage<Actor>();

/** Exécute `fn` (sync ou async) avec l'acteur `actor` établi comme contexte
 *  ambiant. Tout outil appelé PENDANT `fn` — et ses continuations asynchrones —
 *  verra cet acteur via `currentActor()`. Réentrant : un run autonome qui
 *  délègue reste autonome. */
export function runAsActor<T>(actor: Actor, fn: () => T): T {
  return actorStore.run(actor, fn);
}

/** L'acteur du contexte courant. Aucun contexte posé (ex. un chat, un test qui
 *  n'en pose pas) → `interactive` : le comportement historique du chat. */
export function currentActor(): Actor {
  return actorStore.getStore() ?? "interactive";
}

// ── (2) Confinement gaté ─────────────────────────────────────────────────────

/** Résout le périmètre EFFECTIF pour un projet-racine donné, selon l'acteur
 *  ambiant, les coffres persistés et les 3 flags de la précondition D4. Appelé
 *  UNIQUEMENT quand le gate est ON. */
export function currentPerimeter(workspace: string): Perimeter {
  return resolvePerimeter(currentActor(), {
    workspace,
    grants: loadGrants(),
    flags: readPerimeterFlags(),
  });
}

/**
 * Confinement de chemin GATÉ — le remplaçant unique des ~9 `resolveInside` locaux.
 *
 *   • Gate OFF (défaut) : BYTE-IDENTIQUE au resolveInside historique. Une seule
 *     racine (le projet), même `path.resolve(base, rel)`, même prédicat
 *     `abs === base || abs.startsWith(base + sep)`, même message d'erreur
 *     (`${legacyErr} : ${rel}`). AUCUNE I/O, aucun chargement de grants.
 *
 *   • Gate ON : le chemin doit tomber sous l'UNION des racines consenties du
 *     palier de l'acteur, filtrée par `access` (`write` ne retient que les
 *     racines `rw` ; `read` retient tout). En cas de refus, message PÉDAGOGIQUE
 *     (l'appelant l'affiche en isError, sans crash).
 *
 * @param root      racine projet (= workspace du modèle de périmètre)
 * @param rel       chemin relatif proposé par le modèle
 * @param access    `read` (lecture) ou `write` (écriture/édition)
 * @param legacyErr préfixe du message d'erreur OFF (préserve le libellé exact
 *                  de chaque site — presque toujours « chemin hors du projet »)
 */
export function confinePath(
  root: string,
  rel: string,
  access: "read" | "write",
  legacyErr = "chemin hors du projet",
): string {
  if (!flag("DESKTOP_PERIMETER")) {
    // OFF : chemin de code historique, à l'octet près.
    const base = path.resolve(root);
    const abs = path.resolve(base, rel);
    if (abs !== base && !abs.startsWith(base + path.sep)) {
      throw new Error(`${legacyErr} : ${rel}`);
    }
    return abs;
  }
  // ON : union des racines consenties du palier de l'acteur, filtrée par accès.
  const p = currentPerimeter(root);
  const roots = perimeterRoots(p, access);
  try {
    return resolveInsideAny(roots, rel);
  } catch {
    // (#180 É6/D7) une tentative hors-périmètre est un signal de sûreté — enregistré
    // ici pour que decideBreakerStop (nocturnal.ts) puisse s'arrêter à la frontière
    // suivante. Best-effort, jamais bloquant : n'affecte pas le refus déjà décidé.
    recordPerimeterIncident("out-of-perimeter", `${access} ${rel} (acteur ${p.actor})`);
    const verbe = access === "write" ? "en écriture" : "en lecture";
    const detail =
      p.actor === "autonomous"
        ? p.downgraded
          ? " (acteur autonome, garde-fous NON armés → périmètre restreint au workspace ; ce coffre est hors de portée)"
          : " (acteur autonome : les coffres grantés sont en LECTURE SEULE, jamais en écriture)"
        : " (chemin hors de toute racine consentie ; granter le dossier via le picker si nécessaire)";
    throw new Error(`chemin hors du périmètre ${verbe} : ${rel}${detail}`);
  }
}
