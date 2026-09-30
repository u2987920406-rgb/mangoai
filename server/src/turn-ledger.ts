// Registre de livraison d'un tour (patron "delivery ledger" — vu dans Hermes v0.19
// "Quicksilver", 2026-07-23 : un registre qui dit qu'une réponse DOIT être livrée et
// n'est pas encore livrée ; une réponse terminée survit au crash de la gateway et peut
// être redonnée au prochain démarrage). Ici : `.chat-history.json` (flush incrémental
// throttlé, cf. chat-route.ts) résout DÉJÀ « je reviens PENDANT que ça tourne encore » —
// il manquait le cas « le process backend crash BRUTALEMENT (OOM, kill) en plein tour »,
// où rien ne dit après coup si un tour était en vol, ni s'il a fini avant le crash.
//
// `startTurn` écrit `status:"running"` de façon SYNCHRONE dès le début du tour — avant
// tout travail — donc même un crash 1ms après le début laisse une trace sur disque. Si
// au redémarrage `.turn-ledger.json` dit encore "running", c'est la preuve qu'un tour a
// été interrompu, information que `/api/agent-status` (en mémoire, remis à zéro au
// redémarrage) ne peut PAS donner. `finishTurn` bascule sur le résultat réel — best-effort,
// jamais un throw, jamais un blocage du tour.
import path from "node:path";
import fs from "node:fs";
import type { Express } from "express";
import { atomicWriteFileSync } from "./safe-io.js";
import { projectDir, projectExists } from "./projects.js";

export const TURN_LEDGER_FILE_NAME = ".turn-ledger.json";

export type TurnStatus = "running" | "success" | "error" | "incomplete" | "aborted";

export interface TurnLedgerEntry {
  turnId: string;
  status: TurnStatus;
  startedAt: string;
  finishedAt?: string;
  summary?: string;
  /** Le client a déjà vu ce résultat (évite de re-notifier en boucle à chaque ouverture). */
  seen?: boolean;
}

function file(dir: string): string {
  return path.join(dir, TURN_LEDGER_FILE_NAME);
}

function isEntry(v: unknown): v is TurnLedgerEntry {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return typeof o.turnId === "string" && typeof o.status === "string" && typeof o.startedAt === "string";
}

export function readTurnLedger(dir: string): TurnLedgerEntry | null {
  try {
    const data: unknown = JSON.parse(fs.readFileSync(file(dir), "utf8"));
    return isEntry(data) ? data : null;
  } catch {
    return null;
  }
}

/** Pose le marqueur "en vol" — appelé le PLUS TÔT possible dans un tour, avant tout
 *  travail long. Écrit SYNCHRONE (pas de throttle) : c'est l'ancre anti-crash. */
/** CHANTIER 5b — l'horodatage de DEBUT du tour en cours (ms epoch), lu sur le ledger.
 *  Sert d'ancre fiable : tout fichier de code modifie apres cet instant est du travail
 *  de CE tour. 0 si le ledger est absent ou illisible (aucune conclusion possible). */
export function turnStartedAtMs(dir: string): number {
  try {
    const raw = fs.readFileSync(file(dir), "utf8");
    const t = Date.parse(JSON.parse(raw).startedAt ?? "");
    return Number.isFinite(t) ? t : 0;
  } catch {
    return 0;
  }
}

export function startTurn(dir: string, turnId: string): void {
  try {
    fs.mkdirSync(dir, { recursive: true });
    const entry: TurnLedgerEntry = { turnId, status: "running", startedAt: new Date().toISOString() };
    atomicWriteFileSync(file(dir), JSON.stringify(entry, null, 2));
  } catch {
    /* registre best-effort — ne casse jamais le tour */
  }
}

/** Bascule le marqueur sur le résultat réel. Ignore un `finishTurn` dont le `turnId` ne
 *  correspond pas au tour en cours (protège contre un tour concurrent qui aurait déjà
 *  posé sa propre ancre entretemps — cas rare mais honnête). */
export function finishTurn(dir: string, turnId: string, status: Exclude<TurnStatus, "running">, summary?: string): void {
  try {
    const current = readTurnLedger(dir);
    if (current && current.turnId !== turnId) return;
    const entry: TurnLedgerEntry = {
      turnId,
      status,
      startedAt: current?.startedAt ?? new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      ...(summary ? { summary } : {}),
    };
    atomicWriteFileSync(file(dir), JSON.stringify(entry, null, 2));
  } catch {
    /* best-effort */
  }
}

/** Marque le résultat courant comme vu par le client — n'écrit rien si le tour est
 *  toujours "running" (rien à acquitter tant que ce n'est pas résolu). */
export function markTurnSeen(dir: string): void {
  const entry = readTurnLedger(dir);
  if (!entry || entry.status === "running" || entry.seen) return;
  try {
    atomicWriteFileSync(file(dir), JSON.stringify({ ...entry, seen: true }, null, 2));
  } catch {
    /* best-effort */
  }
}

// ── Opérations différées (#0.4, audit fault-finding 2026-07-23) ─────────────
//
// Trouvaille de l'audit : `chat-route.ts` appelle `finishTurn` SANS attendre les
// opérations fire-and-forget qu'il vient de lancer (review, patrouille, compaction,
// diagramme "après") — `.turn-ledger.json` affiche donc "success" alors que ces 4
// sous-systèmes peuvent encore tourner, ou avoir crashé, en arrière-plan, sans que
// rien ne le sache. Registre SÉPARÉ (ne retarde jamais le tour visible) : chaque
// opération pose sa propre ancre "running" à son lancement, résolue à sa conclusion —
// même discipline que `startTurn`/`finishTurn`, appliquée par opération nommée plutôt
// que par tour entier.
export const DEFERRED_FILE_NAME = ".turn-ledger-deferred.json";

export interface DeferredOpEntry {
  op: string; // "review" | "patrol" | "compaction" | "diagram-apres" …
  turnId: string; // le tour qui a déclenché cette opération
  status: "running" | "success" | "error";
  startedAt: string;
  finishedAt?: string;
}

function deferredFile(dir: string): string {
  return path.join(dir, DEFERRED_FILE_NAME);
}

function isDeferredEntry(v: unknown): v is DeferredOpEntry {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return typeof o.op === "string" && typeof o.turnId === "string" && typeof o.status === "string" && typeof o.startedAt === "string";
}

export function readDeferredOps(dir: string): DeferredOpEntry[] {
  try {
    const data: unknown = JSON.parse(fs.readFileSync(deferredFile(dir), "utf8"));
    return Array.isArray(data) ? data.filter(isDeferredEntry) : [];
  } catch {
    return [];
  }
}

function writeDeferredOps(dir: string, entries: DeferredOpEntry[]): void {
  try {
    atomicWriteFileSync(deferredFile(dir), JSON.stringify(entries, null, 2));
  } catch {
    /* best-effort */
  }
}

/** Pose l'ancre "en vol" pour UNE opération différée nommée (une entrée par `op`, la
 *  plus récente remplace la précédente — pas un historique complet, juste l'état
 *  courant). Écrit SYNCHRONE, avant que l'opération elle-même ne démarre. */
function startDeferredOp(dir: string, turnId: string, op: string): void {
  try {
    fs.mkdirSync(dir, { recursive: true });
    const entries = readDeferredOps(dir).filter((e) => e.op !== op);
    entries.push({ op, turnId, status: "running", startedAt: new Date().toISOString() });
    writeDeferredOps(dir, entries);
  } catch {
    /* best-effort */
  }
}

function finishDeferredOp(dir: string, turnId: string, op: string, status: "success" | "error"): void {
  try {
    const entries = readDeferredOps(dir);
    const idx = entries.findIndex((e) => e.op === op && e.turnId === turnId);
    if (idx < 0) return; // ancre déjà remplacée par une opération plus récente du même nom
    entries[idx] = { ...entries[idx]!, status, finishedAt: new Date().toISOString() };
    writeDeferredOps(dir, entries);
  } catch {
    /* best-effort */
  }
}

/** Enveloppe une opération fire-and-forget pour qu'elle pose/résolve sa propre ancre —
 *  patron `void trackDeferred(dir, turnId, "review", spawnBackgroundReview(...))`.
 *  NE RETARDE JAMAIS l'appelant (l'ancre de départ est synchrone, le reste suit la
 *  promesse existante sans y ajouter d'attente). Ne lève jamais. */
export function trackDeferred<T>(dir: string, turnId: string, op: string, promise: Promise<T>): Promise<T> {
  startDeferredOp(dir, turnId, op);
  return promise
    .then((v) => {
      finishDeferredOp(dir, turnId, op, "success");
      return v;
    })
    .catch((err) => {
      finishDeferredOp(dir, turnId, op, "error");
      throw err;
    });
}

/** `GET /api/turn-status/:name` — le client interroge ceci à l'ouverture d'un projet
 *  pour détecter un tour interrompu par un crash (`status:"running"` jamais résolu) ou
 *  un résultat terminé pas encore vu (`seen` absent). `POST .../seen` acquitte. Inclut
 *  les opérations différées ENCORE "running" pour le tour courant (#0.4) — un tour
 *  "success" dont la review/patrouille/diagramme n'a jamais résolu doit être visible. */
export function registerTurnLedgerRoutes(app: Express): void {
  app.get("/api/turn-status/:name", (req, res) => {
    const name = req.params["name"] as string;
    if (!projectExists(name)) {
      res.json({ entry: null, deferred: [] });
      return;
    }
    const dir = projectDir(name);
    const entry = readTurnLedger(dir);
    const deferred = entry ? readDeferredOps(dir).filter((d) => d.turnId === entry.turnId) : [];
    res.json({ entry, deferred });
  });

  app.post("/api/turn-status/:name/seen", (req, res) => {
    const name = req.params["name"] as string;
    if (projectExists(name)) markTurnSeen(projectDir(name));
    res.json({ ok: true });
  });
}
