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

/** `GET /api/turn-status/:name` — le client interroge ceci à l'ouverture d'un projet
 *  pour détecter un tour interrompu par un crash (`status:"running"` jamais résolu) ou
 *  un résultat terminé pas encore vu (`seen` absent). `POST .../seen` acquitte. */
export function registerTurnLedgerRoutes(app: Express): void {
  app.get("/api/turn-status/:name", (req, res) => {
    const name = req.params["name"] as string;
    if (!projectExists(name)) {
      res.json({ entry: null });
      return;
    }
    res.json({ entry: readTurnLedger(projectDir(name)) });
  });

  app.post("/api/turn-status/:name/seen", (req, res) => {
    const name = req.params["name"] as string;
    if (projectExists(name)) markTurnSeen(projectDir(name));
    res.json({ ok: true });
  });
}
