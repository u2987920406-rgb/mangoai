// Boîte noire par projet (#183, 2026-07-08) — Raf : « je voudrais que dans chaque
// projet que Mango lance, il y ait un backlog… tout ce qui a été fait, ligne par
// ligne, doit apparaître dans ce log, peu importe qui le fait (GLM, Sonnet, Haiku,
// Fable 5, agent forgé…) ». Mémoire 100% interne au projet, jamais résumée/tronquée
// par un modèle : chaque action réelle (outil exécuté, verdict Gardien, blocage
// Stratège, lacune inscrite, escalade) devient une ligne JSONL append-only dans
// workspace/<projet>/.backlog.jsonl.
//
// Pur best-effort : ne lève JAMAIS (une panne d'écriture/lecture de ce journal
// ne doit jamais interrompre un tour agentique — c'est de l'observabilité, pas
// une garde). Format JSONL (pas un JSON.parse + réécriture complète comme
// history.ts) : un append est une seule syscall, aucun risque de perdre TOUT le
// journal si le process meurt en pleine écriture.
import fs from "node:fs";
import path from "node:path";

export const BACKLOG_FILE_NAME = ".backlog.jsonl";

export interface BacklogEntry {
  /** Horodatage ISO. */
  ts: string;
  /** Qui a fait l'action : « Élève (glm-5.2:cloud) », « Gardien », « Stratège »,
   *  « Agent forgé : Contremaître local », etc. Texte libre, lisible tel quel. */
  actor: string;
  /** Verbe/nom court de l'action (ex. nom d'outil, "clôture", "blocage", "lacune"). */
  action: string;
  /** Détail court et lisible (chemin de fichier, verdict, raison…). Jamais le
   *  contenu complet d'une écriture — un résumé, pas un dump. */
  detail?: string;
  /** Succès/échec quand la notion s'applique (outil, gate). Absent = neutre. */
  ok?: boolean;
}

function backlogPath(dir: string): string {
  return path.join(dir, BACKLOG_FILE_NAME);
}

function isBacklogEntry(value: unknown): value is BacklogEntry {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.ts === "string" && typeof v.actor === "string" && typeof v.action === "string";
}

/** Tronque un détail pour rester une LIGNE de journal, jamais un dump de contenu. */
export function truncateDetail(text: string, max = 220): string {
  const s = (text ?? "").replace(/\s+/g, " ").trim();
  return s.length > max ? s.slice(0, max) + "…" : s;
}

/** Ajoute une ligne au journal-boîte-noire du projet. Best-effort, ne lève jamais. */
export function appendBacklog(
  dir: string,
  entry: { actor: string; action: string; detail?: string; ok?: boolean; ts?: string },
): void {
  if (!dir) return;
  try {
    const full: BacklogEntry = {
      ts: entry.ts ?? new Date().toISOString(),
      actor: entry.actor,
      action: entry.action,
      ...(entry.detail !== undefined ? { detail: truncateDetail(entry.detail) } : {}),
      ...(entry.ok !== undefined ? { ok: entry.ok } : {}),
    };
    fs.appendFileSync(backlogPath(dir), JSON.stringify(full) + "\n", "utf8");
  } catch {
    // best-effort — un journal cassé ne doit jamais bloquer un tour.
  }
}

/** Lit le journal. Une ligne corrompue est ignorée (jamais un crash de lecture).
 *  `limit` (si fourni, >0) ne renvoie que les N dernières entrées. */
export function readBacklog(dir: string, limit?: number): BacklogEntry[] {
  let raw: string;
  try {
    raw = fs.readFileSync(backlogPath(dir), "utf8");
  } catch {
    return [];
  }
  const out: BacklogEntry[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (isBacklogEntry(parsed)) out.push(parsed);
    } catch {
      // ligne corrompue — ignorée.
    }
  }
  return limit && limit > 0 ? out.slice(-limit) : out;
}

/** Rendu compact d'une entrée pour une UI/CLI future. */
export function formatBacklogEntry(e: BacklogEntry): string {
  const okMark = e.ok === false ? " ❌" : "";
  const detail = e.detail ? ` — ${e.detail}` : "";
  return `[${e.ts}] ${e.actor} · ${e.action}${detail}${okMark}`;
}
