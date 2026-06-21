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

/** Mutation diffusée aux abonnés SSE (#138 Phase 2) : une app sœur voit le
 * changement en temps réel, sans poller. `value` absente sur un delete. */
export interface SharedChange {
  type: "put" | "delete";
  collection: string;
  key: string;
  value?: unknown;
}

// Préfixe de scope : isole les collections partagées des autres usages du
// Blackboard (artefacts design, etc.) dans le même store.
const SCOPE_PREFIX = "shared:";

// ── Pub/sub temps réel (#138 Phase 2) ───────────────────────────────────────
// Un Set d'abonnés par collection. Les routes SSE (index.ts) s'y branchent ;
// putDoc/deleteDoc émettent. En mémoire, éphémère — la cohérence durable reste
// au Blackboard ; ceci ne fait que NOTIFIER (push vs poll).
type ChangeListener = (change: SharedChange) => void;
const listeners = new Map<string, Set<ChangeListener>>();

/** Abonne un listener aux mutations d'une collection. Renvoie le désabonnement. */
export function subscribe(collection: string, listener: ChangeListener): () => void {
  const c = slug(collection);
  let set = listeners.get(c);
  if (!set) {
    set = new Set();
    listeners.set(c, set);
  }
  set.add(listener);
  return () => {
    const s = listeners.get(c);
    if (!s) return;
    s.delete(listener);
    if (s.size === 0) listeners.delete(c);
  };
}

/** Nombre d'abonnés d'une collection (diagnostic/test). */
export function subscriberCount(collection: string): number {
  return listeners.get(slug(collection))?.size ?? 0;
}

function emit(change: SharedChange): void {
  const set = listeners.get(change.collection);
  if (!set) return;
  // Copie défensive : un listener qui se désabonne pendant la diffusion ne doit
  // pas corrompre l'itération. Une erreur d'un abonné n'affecte pas les autres.
  for (const l of [...set]) {
    try {
      l(change);
    } catch {
      /* un abonné fautif ne casse pas la diffusion */
    }
  }
}

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

/** Écrit (crée ou remplace) un document. Renvoie la clé slugifiée effective.
 * Émet une mutation `put` aux abonnés SSE de la collection. */
export function putDoc(collection: string, key: string, value: unknown): string {
  const c = slug(collection);
  const k = slug(key);
  getBlackboard().put(SCOPE_PREFIX + c, k, value);
  emit({ type: "put", collection: c, key: k, value });
  return k;
}

/** Supprime un document. true si quelque chose a été supprimé. Émet une
 * mutation `delete` aux abonnés SSE seulement si quelque chose a été retiré. */
export function deleteDoc(collection: string, key: string): boolean {
  const c = slug(collection);
  const k = slug(key);
  const removed = getBlackboard().delete(SCOPE_PREFIX + c, k);
  if (removed) emit({ type: "delete", collection: c, key: k });
  return removed;
}

/** Noms des collections partagées non vides (dérivés des scopes `shared:*`).
 * Le Blackboard n'expose pas la liste des scopes ; on la reconstruit en scannant
 * les manifests des apps (cf. suite-routes.ts) — ici on borne juste l'API. */
export function collectionScope(collection: string): string {
  return scopeOf(collection);
}
