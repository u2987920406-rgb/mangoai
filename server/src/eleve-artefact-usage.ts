// Trace ÉPHÉMÈRE de ce que `chercher_artefact` (#156) a SERVI pendant le tour
// courant, par projet (L29). Pourquoi : la mesure de réutilisation #121/#122
// (`kernel-reuse-metrics.ts`) repère la réutilisation de palette par RECOUVREMENT
// de hex littéraux — aveugle quand l'Élève réutilise une identité via des classes
// utilitaires (Tailwind) plutôt que des couleurs `#rrggbb`. Le run du 2026-06-25
// l'a prouvé : `chercher_artefact` ramenait la bonne palette Mango, l'app la
// réutilisait visiblement (snap), mais `reuseRatePct` restait à 0.
//
// Ici on capte le signal direct : la MÉMOIRE d'artefacts a été consultée ET a
// servi du matériel réutilisable ce tour. In-process (comme `eleve-plan`), JAMAIS
// le Blackboard (qui est pour le durable cross-projet) : on mémorise les
// PROVENANCES (projets/domaines) des artefacts retournés, le tour les consomme
// dans son `finally`, puis on oublie. Pur côté lecture, ne lève jamais.

import path from "node:path";

/** clé projet → ensemble des provenances d'artefacts servies (dédupliquées). */
const surfaced = new Map<string, Set<string>>();

/** Normalise le chemin de projet en clé stable (writer et reader peuvent différer
 * d'un `path.resolve`). Tolérant : si la résolution échoue, on garde la chaîne. */
function keyOf(projectDir: string): string {
  try {
    return path.resolve(projectDir);
  } catch {
    return projectDir;
  }
}

/** Mémorise les provenances (noms de projet/domaine) d'artefacts servis ce tour. */
export function recordArtefactUsage(projectDir: string, sources: string[]): void {
  if (!sources || sources.length === 0) return;
  const k = keyOf(projectDir);
  const set = surfaced.get(k) ?? new Set<string>();
  for (const s of sources) {
    const name = (s ?? "").trim();
    if (name) set.add(name);
  }
  if (set.size) surfaced.set(k, set);
}

/** Récupère ET vide les provenances servies ce tour (consommation unique). */
export function takeArtefactUsage(projectDir: string): string[] {
  const k = keyOf(projectDir);
  const set = surfaced.get(k);
  if (!set) return [];
  surfaced.delete(k);
  return [...set];
}

/** Oublie les provenances en attente d'un projet (repart propre). */
export function clearArtefactUsage(projectDir: string): void {
  surfaced.delete(keyOf(projectDir));
}
