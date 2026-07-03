// Crash-safe persistence for the small JSON stores the server and its
// background agents rewrite in full (sessions.json, .chat-history.json):
// write a sibling temp file then rename it over the target, so a crash or
// power cut mid-write can never leave a truncated file as the only copy.
import fs from "node:fs";

export function atomicWriteFileSync(file: string, data: string): void {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, data);
  try {
    fs.renameSync(tmp, file);
  } catch {
    // Windows refuses the replace when the target is briefly held open
    // (editor, antivirus scan) — fall back to a direct write. The temp file
    // is cleaned up in a finally so it never leaks even if the fallback write
    // itself throws (previously the rmSync was unreachable in that case).
    try {
      fs.writeFileSync(file, data);
    } finally {
      fs.rmSync(tmp, { force: true });
    }
  }
}

// (A0.1, 2026-07-03) Append ATOMIQUE — pour protéger le « cerveau appris »
// (.axioms.md, .preferences.md, meta.json des références) contre la corruption
// d'un crash/coupure en cours d'écriture. fs.appendFileSync n'est pas atomique
// (une coupure peut laisser une ligne tronquée) ; on lit+concatène+écrit via
// atomicWriteFileSync (temp + rename).
//
// PIÈGE (signalé par l'architecte) : l'append atomique = read-modify-write, ce
// qui INTRODUIT une course que l'append POSIX n'avait pas — deux appends
// concurrents pouvaient se lire mutuellement l'état d'AVANT et l'un écraser
// l'autre. Le serveur est mono-process : on sérialise donc par chemin avec une
// file de promesses en mémoire (`serialByPath`). La version SYNC applique le
// même read-modify-write mais reste exposée à la course si mélangée à la version
// async sur le même fichier — d'où la règle : un fichier donné est écrit par UNE
// seule voie. En pratique les magasins appris n'écrivent que par appendAxiom /
// saveXxx, tous re-routés ici.

/** File d'attente sérielle par chemin (mono-process) : garantit qu'un même
 *  fichier n'a jamais deux read-modify-write concurrents qui s'écrasent. */
const serialByPath = new Map<string, Promise<void>>();

/** Enchaîne `task` derrière les opérations en cours sur `file`. Les erreurs de
 *  `task` ne cassent JAMAIS la chaîne (fail-open : un append perdu vaut mieux
 *  qu'une file bloquée), mais sont propagées à l'appelant de CE tour. */
function serialize(file: string, task: () => void | Promise<void>): Promise<void> {
  const prev = serialByPath.get(file) ?? Promise.resolve();
  // `.catch` sur `prev` : une erreur d'un append précédent ne doit pas empêcher
  // les suivants de s'exécuter. On récupère le résultat de NOTRE task séparément.
  const run = prev.catch(() => undefined).then(() => task());
  // La chaîne stockée avale les erreurs (pour ne pas bloquer la file) ; on nettoie
  // l'entrée quand c'est la dernière, pour ne pas faire fuir la Map.
  const chained = run.catch(() => undefined).finally(() => {
    if (serialByPath.get(file) === chained) serialByPath.delete(file);
  });
  serialByPath.set(file, chained);
  return run;
}

/** Append atomique ASYNC + sérialisé (recommandé pour les écritures concurrentes). */
export function atomicAppendFile(file: string, chunk: string): Promise<void> {
  return serialize(file, () => {
    let cur = "";
    try {
      cur = fs.readFileSync(file, "utf8");
    } catch {
      cur = ""; // fichier absent → création
    }
    const sep = cur.length > 0 && !cur.endsWith("\n") ? "\n" : "";
    atomicWriteFileSync(file, `${cur}${sep}${chunk}`);
  });
}

/** Append atomique SYNC (pour les appelants synchrones existants). NE PAS
 *  mélanger avec atomicAppendFile sur le MÊME fichier (la course revient). */
export function atomicAppendFileSync(file: string, chunk: string): void {
  let cur = "";
  try {
    cur = fs.readFileSync(file, "utf8");
  } catch {
    cur = "";
  }
  const sep = cur.length > 0 && !cur.endsWith("\n") ? "\n" : "";
  atomicWriteFileSync(file, `${cur}${sep}${chunk}`);
}
