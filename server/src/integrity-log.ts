// Journal d'intégrité des registres d'état (#196 fault-finding, Partie 1, 2026-07-23).
//
// Primitive BAS NIVEAU volontairement séparée d'`integrity-audit.ts` (qui, lui, connaît
// TOUS les stores de l'écosystème et importerait donc `specialist-agents.ts`,
// `self-evolution.ts`, etc. — un cycle si CES modules importaient `integrity-audit.ts`
// en retour). Ici : zéro dépendance vers un store métier, seulement `safe-io.ts`. Les
// modules de stockage (`saveSpecialists`, `saveGaps`, `saveConceptGaps`…) importent
// CE fichier pour journaliser leurs propres pertes de validation, sans risque de cycle.
//
// Née d'un vrai incident (2026-07-23) : `specialist-agents.json` a perdu 10 agents
// forgés sans qu'AUCUNE trace n'existe nulle part pour le prouver — l'investigation
// n'a pu que CONCLURE (suppression manuelle probable), jamais confirmer avec certitude.
// Ce module rend cette classe d'incident visible dès qu'elle se produit, plutôt que
// des semaines plus tard en fouillant à la main.
import path from "node:path";
import fs from "node:fs";
import { atomicAppendFileSync, dataDir } from "./safe-io.js";

export const AUDIT_LOG_FILE_NAME = "integrity-audit.log.jsonl";

export type DropKind = "validation-drop" | "vanished-between-snapshots";

export interface DropLogEntry {
  kind: DropKind;
  store: string;
  ids: string[];
  reason?: string;
  ts: string;
}

function auditLogPath(): string {
  return process.env.INTEGRITY_AUDIT_LOG_FILE ?? dataDir(AUDIT_LOG_FILE_NAME);
}

/** Journalise une perte d'entrée(s) — best-effort, ne lève JAMAIS (un journal raté ne
 *  doit jamais casser une sauvegarde réelle). N'écrit rien si `ids` est vide. */
export function logDrop(entry: Omit<DropLogEntry, "ts">): void {
  if (entry.ids.length === 0) return;
  try {
    const p = auditLogPath();
    fs.mkdirSync(path.dirname(p), { recursive: true });
    atomicAppendFileSync(p, JSON.stringify({ ...entry, ts: new Date().toISOString() }));
  } catch {
    /* best-effort */
  }
  console.warn(
    `[integrity] ${entry.store} : ${entry.ids.length} entrée(s) perdue(s) (${entry.kind}` +
      `${entry.reason ? " — " + entry.reason : ""}) : ${entry.ids.slice(0, 10).join(", ")}` +
      `${entry.ids.length > 10 ? "…" : ""}`,
  );
}

/** Aide un point de sauvegarde à détecter une perte de VALIDATION en une ligne : compare
 *  les ids AVANT filtrage à ceux APRÈS, journalise le delta. `idOf` extrait un id stable
 *  depuis une entrée BRUTE (avant validation) — une entrée sans id exploitable est
 *  ignorée du diff (jamais de faux positif sur du bruit non identifiable). Ne lève jamais. */
export function logValidationDrop(
  store: string,
  before: unknown[],
  after: { id?: unknown }[],
  idOf: (raw: unknown) => string | null,
): void {
  try {
    const beforeIds = new Set(before.map(idOf).filter((x): x is string => x !== null));
    const afterIds = new Set(after.map((a) => (typeof a.id === "string" ? a.id : null)).filter((x): x is string => x !== null));
    const dropped = [...beforeIds].filter((id) => !afterIds.has(id));
    if (dropped.length > 0) {
      logDrop({ kind: "validation-drop", store, ids: dropped, reason: "rejeté par la validation au moment de la sauvegarde" });
    }
  } catch {
    /* best-effort — la détection ne doit jamais casser la sauvegarde réelle */
  }
}

/** Lit le journal d'intégrité (le plus récent en dernier). Ne lève jamais. */
export function readAuditLog(): DropLogEntry[] {
  try {
    const raw = fs.readFileSync(auditLogPath(), "utf8");
    const out: DropLogEntry[] = [];
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const parsed: unknown = JSON.parse(trimmed);
        if (parsed && typeof parsed === "object" && Array.isArray((parsed as DropLogEntry).ids)) {
          out.push(parsed as DropLogEntry);
        }
      } catch {
        /* ligne corrompue — ignorée */
      }
    }
    return out;
  } catch {
    return [];
  }
}
