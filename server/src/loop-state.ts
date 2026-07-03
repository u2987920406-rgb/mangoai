// Snapshot de reprise de la boucle agentique (B0.3, gate ELEVE_RESUME) —
// ÉCRITURE SEULE pour l'instant : on persiste où en est la boucle à chaque
// frontière d'itération, dans `<projectDir>/.eleve-run.json`. La RESTAURATION
// (relire ce fichier pour reprendre après un crash/redémarrage) est HORS
// PÉRIMÈTRE ici (= B1.4) — on écrit d'abord pour dé-risquer le format et l'I/O
// avant de brancher quoi que ce soit dessus.
//
// Deps disque INJECTÉES (comme le reste du chantier fondations) : le vrai appelant
// utilise fs (via safe-io pour l'écriture atomique), les tests un faux en mémoire.
// Fail-open partout : un snapshot perdu/corrompu ne doit JAMAIS casser la boucle.

import fs from "node:fs";
import path from "node:path";
import { atomicWriteFileSync } from "./safe-io.js";
import type { ChatMessage } from "./eleve-runtime.js";

export const SNAPSHOT_FILE = ".eleve-run.json";
export const DEFAULT_SNAPSHOT_TTL_MS = 2 * 60 * 60 * 1000; // 2h

/** Version du format — toute évolution incompatible bascule ce nombre ; un
 * snapshot d'une version inconnue (ancienne OU future) est ignoré (`loadSnapshot`
 * → null — fichier éphémère TTL 2h, on préfère perdre une reprise que d'en faire
 * une fausse). v2 (revue Fable 2026-07-03, 🔴1) : champ `user` dédié — la garde
 * « même tâche » ne peut PAS s'appuyer sur `messages[1]` (ELEVE_ETAT y splice
 * l'état de travail après compaction, ce qui rendait la reprise impossible dès
 * que les deux gates étaient allumés ensemble). */
export interface LoopSnapshot {
  version: 2;
  ts: number;
  iter: number;
  /** Le message user d'origine du run — la clé de la garde « même tâche ». */
  user: string;
  hasWritten: boolean;
  messages: ChatMessage[];
  toolTrace: Array<{ name: string; args: string }>;
}

/** Disque injecté (tests) — défauts = vrai fs (écriture via safe-io atomique). */
export interface LoopStateDeps {
  writeFile?: (file: string, data: string) => void;
  readFile?: (file: string) => string;
  exists?: (file: string) => boolean;
  remove?: (file: string) => void;
  /** Horloge injectable — pour tester le TTL sans attendre. */
  now?: () => number;
}

function snapshotPath(projectDir: string): string {
  return path.join(projectDir, SNAPSHOT_FILE);
}

/** Écrit le snapshot (atomique). Fail-open : une erreur disque n'interrompt
 * jamais la boucle appelante (au pire, on perd juste la reprise). */
export function saveSnapshot(projectDir: string, snap: LoopSnapshot, deps: LoopStateDeps = {}): void {
  const write = deps.writeFile ?? atomicWriteFileSync;
  try {
    write(snapshotPath(projectDir), JSON.stringify(snap));
  } catch {
    // fail-open
  }
}

/** Supprime le snapshot (fin propre : finish / sortie propre / abort). Fail-open
 * si le fichier est déjà absent (rien à faire) ou si la suppression échoue. */
export function clearSnapshot(projectDir: string, deps: LoopStateDeps = {}): void {
  const exists = deps.exists ?? ((f: string) => fs.existsSync(f));
  const remove = deps.remove ?? ((f: string) => fs.rmSync(f, { force: true }));
  try {
    const f = snapshotPath(projectDir);
    if (exists(f)) remove(f);
  } catch {
    // fail-open
  }
}

/**
 * Lit + parse le snapshot. Renvoie `null` (jamais ne lève) si : absent,
 * illisible/corrompu (JSON invalide ou champs manquants), version inconnue,
 * ou périmé (`now() - ts > ttlMs`).
 */
export function loadSnapshot(
  projectDir: string,
  ttlMs: number = DEFAULT_SNAPSHOT_TTL_MS,
  deps: LoopStateDeps = {},
): LoopSnapshot | null {
  const exists = deps.exists ?? ((f: string) => fs.existsSync(f));
  const read = deps.readFile ?? ((f: string) => fs.readFileSync(f, "utf8"));
  const now = deps.now ?? (() => Date.now());
  const f = snapshotPath(projectDir);
  try {
    if (!exists(f)) return null;
    const raw = read(f);
    const data = JSON.parse(raw) as Partial<LoopSnapshot>;
    if (data.version !== 2) return null; // version inconnue (v1 legacy incluse) → ignoré
    if (typeof data.ts !== "number") return null;
    if (typeof data.iter !== "number") return null;
    if (typeof data.user !== "string") return null;
    if (typeof data.hasWritten !== "boolean") return null;
    if (!Array.isArray(data.messages) || !Array.isArray(data.toolTrace)) return null;
    if (now() - data.ts > ttlMs) return null; // périmé
    return data as LoopSnapshot;
  } catch {
    return null; // corrompu → fail-open
  }
}
