// #138 OS d'apps — Colonne de données partagée (le cœur de la spine).
//
// La VRAIE valeur d'une suite composable : des apps autonomes qui se PARLENT.
// Sans donnée partagée, un launcher de 20 apps n'est qu'un menu Démarrer plus
// joli. Ce module est un wrapper MINCE sur le Blackboard du Kernel (pilier 3,
// kernel-blackboard.ts) : aucun nouveau moteur, on réutilise le store enfichable
// déjà persistant (SqliteStore via BLACKBOARD_DB, MemoryStore sinon).
//
// Modèle : une COLLECTION (ex. "tasks") = un scope Blackboard `shared:<collection>`.
// Chaque document = une (key → value JSON) dans ce scope. Les apps générées (sur
// un autre port) y accèdent par REST (/api/shared/...) — CORS déjà ouvert — donc
// le partage est CROSS-FRAMEWORK : pas besoin de standardiser sur React.
import { getBlackboard } from "./kernel-blackboard.js";

/** Un document de collection partagée tel que renvoyé par l'API. */
export interface SharedDoc {
  key: string;
  value: unknown;
}

// Préfixe de scope : isole les collections partagées des autres usages du
// Blackboard (artefacts design, etc.) dans le même store.
const SCOPE_PREFIX = "shared:";

/** Slugifie une collection/clé : garde-fou contre l'injection de scope et les
 * caractères qui casseraient une route. Renvoie "" si rien d'exploitable. */
export function slug(raw: string): string {
  return String(raw ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
}

function scopeOf(collection: string): string {
  return SCOPE_PREFIX + slug(collection);
}

/** Tous les documents d'une collection (vide si la collection n'existe pas). */
export function listDocs(collection: string): SharedDoc[] {
  const bb = getBlackboard();
  const scope = scopeOf(collection);
  return bb.keys(scope).map((key) => ({ key, value: bb.get(scope, key) }));
}

/** Lit un document (undefined si absent). */
export function getDoc(collection: string, key: string): unknown {
  return getBlackboard().get(scopeOf(collection), slug(key));
}

/** Écrit (crée ou remplace) un document. Renvoie la clé slugifiée effective. */
export function putDoc(collection: string, key: string, value: unknown): string {
  const k = slug(key);
  getBlackboard().put(scopeOf(collection), k, value);
  return k;
}

/** Supprime un document. true si quelque chose a été supprimé. */
export function deleteDoc(collection: string, key: string): boolean {
  return getBlackboard().delete(scopeOf(collection), slug(key));
}

/** Noms des collections partagées non vides (dérivés des scopes `shared:*`).
 * Le Blackboard n'expose pas la liste des scopes ; on la reconstruit en scannant
 * les manifests des apps (cf. suite-routes.ts) — ici on borne juste l'API. */
export function collectionScope(collection: string): string {
  return scopeOf(collection);
}
