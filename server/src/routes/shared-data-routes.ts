// #138 OS d'apps — Colonne de données partagée (la spine). CRUD REST + SSE sur le
// Blackboard, scope `shared:<collection>`. Extraite verbatim de index.ts
// (comportement inchangé). Les helpers de scope module d'index.ts (SHARED_MAX_BYTES,
// aclDenyWrite, schemaRejectWrite) sont déplacés ici à l'identique. L'ordre interne
// des routes est préservé (/:collection/stream AVANT /:collection/:key).
import express from "express";
import { listDocs, getDoc, putDoc, deleteDoc, slug, subscribe } from "../shared-data.js";
import { listProjects, projectDir } from "../projects.js";
import {
  loadManifest, findManifestById, accessAllowsWrite,
  findCollectionSchema, validateAgainstSchema, type MangoAppManifest,
} from "../mango-app-contract.js";

const SHARED_MAX_BYTES = 256 * 1024;
// #138 Phase 2 — ACL de CONFORMANCE par app. Une app s'identifie via l'en-tête
// `X-MangoApp-Id` (= l'id de son manifest) ; si elle a déclaré la collection en
// `read`, une écriture est refusée (403). Sans en-tête (app non instrumentée /
// outil externe) ou app inconnue (peut être en cours de génération) → on laisse
// passer : c'est un garde-fou de cohérence, pas une frontière de sécurité
// (local-first). Renvoie un message de refus, ou null si l'écriture est permise.
function aclDenyWrite(req: express.Request, collection: string): string | null {
  const appId = String(req.header("x-mangoapp-id") ?? "").trim();
  if (!appId) return null;
  const manifest = findManifestById(listProjects().map((p) => projectDir(p)), appId);
  if (!manifest) return null;
  const decl = manifest.collections.find((c) => slug(c.name) === collection);
  if (accessAllowsWrite(decl?.access)) return null;
  return `L'app « ${manifest.name} » a déclaré « ${collection} » en ${decl?.access ?? "non déclarée"} — écriture refusée (ACL de conformance #138).`;
}
// #138 Phase 2 — Validation de SCHÉMA. Si une app déclare la forme d'une
// collection (`schema`), une écriture non conforme est refusée (422) → les apps
// sœurs lisent une donnée fiable. Aucun schéma déclaré → aucune contrainte.
function schemaRejectWrite(collection: string, value: unknown): string | null {
  const manifests = listProjects()
    .map((p) => loadManifest(projectDir(p)))
    .filter((m): m is MangoAppManifest => m !== null);
  const schema = findCollectionSchema(manifests, collection, slug);
  if (!schema) return null;
  const r = validateAgainstSchema(value, schema);
  return r.ok ? null : `Schéma de « ${collection} » non respecté : ${r.error} (validation de schéma #138-P2).`;
}

export function registerSharedDataRoutes(app: express.Express): void {

app.get("/api/shared/:collection", (req, res) => {
  const collection = slug(req.params["collection"] as string);
  if (!collection) {
    res.status(400).json({ error: "Collection invalide" });
    return;
  }
  res.json({ collection, docs: listDocs(collection) });
});
// #138 Phase 2 — Sync TEMPS RÉEL (SSE) : une app sœur s'abonne et voit les
// mutations sans poller. Doit être déclarée AVANT `/:collection/:key` (sinon
// « stream » serait pris pour une clé). Snapshot initial puis push par mutation.
app.get("/api/shared/:collection/stream", (req, res) => {
  const collection = slug(req.params["collection"] as string);
  if (!collection) {
    res.status(400).json({ error: "Collection invalide" });
    return;
  }
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
  // État courant d'abord (l'abonné démarre cohérent), puis le flux des changements.
  res.write(`event: snapshot\ndata: ${JSON.stringify({ collection, docs: listDocs(collection) })}\n\n`);
  const unsub = subscribe(collection, (change) => {
    res.write(`event: change\ndata: ${JSON.stringify(change)}\n\n`);
  });
  // Battement de cœur : garde la connexion ouverte à travers proxies/timeouts.
  const heartbeat = setInterval(() => res.write(`: ping\n\n`), 25000);
  req.on("close", () => {
    clearInterval(heartbeat);
    unsub();
  });
});
app.get("/api/shared/:collection/:key", (req, res) => {
  const collection = slug(req.params["collection"] as string);
  const key = slug(req.params["key"] as string);
  if (!collection || !key) {
    res.status(400).json({ error: "Collection ou clé invalide" });
    return;
  }
  const value = getDoc(collection, key);
  if (value === undefined) {
    res.status(404).json({ error: "Document introuvable" });
    return;
  }
  res.json({ collection, key, value });
});
app.put("/api/shared/:collection/:key", (req, res) => {
  const collection = slug(req.params["collection"] as string);
  const key = slug(req.params["key"] as string);
  if (!collection || !key) {
    res.status(400).json({ error: "Collection ou clé invalide" });
    return;
  }
  const { value } = req.body as { value?: unknown };
  if (value === undefined) {
    res.status(400).json({ error: "Champ 'value' requis" });
    return;
  }
  if (JSON.stringify(value).length > SHARED_MAX_BYTES) {
    res.status(413).json({ error: "Valeur trop volumineuse (max 256 ko)" });
    return;
  }
  const denied = aclDenyWrite(req, collection);
  if (denied) {
    res.status(403).json({ error: denied });
    return;
  }
  const schemaErr = schemaRejectWrite(collection, value);
  if (schemaErr) {
    res.status(422).json({ error: schemaErr });
    return;
  }
  const savedKey = putDoc(collection, key, value);
  res.json({ collection, key: savedKey, value });
});
app.delete("/api/shared/:collection/:key", (req, res) => {
  const collection = slug(req.params["collection"] as string);
  const key = slug(req.params["key"] as string);
  if (!collection || !key) {
    res.status(400).json({ error: "Collection ou clé invalide" });
    return;
  }
  const denied = aclDenyWrite(req, collection);
  if (denied) {
    res.status(403).json({ error: denied });
    return;
  }
  res.json({ ok: deleteDoc(collection, key) });
});

}
