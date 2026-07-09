// Signaux git de l'escalade (extrait de eleve.ts, comportement inchangé).
// Sert à distinguer un VRAI changement de code d'un simple fichier de métadonnées
// lorsque le Maître (Claude) a « répondu » : évite un faux « résolu par le Maître,
// +1 axiome » alors que zéro ligne de code n'a été écrite (correctif L113).
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { BACKLOG_FILE_NAME } from "./project-backlog.js";
import { LEXIQUE_FILE_NAME } from "./lexique.js";
import { ARCHITECTURE_FILE_NAME } from "./architecture.js";
import { HISTORY_FILE_NAME } from "./history.js";
import { MEMORY_FILE_NAME } from "./memory.js";

// Fichiers de métadonnées (non gitignorés mais jamais du "code") — filtrés pour ne
// compter que les VRAIS changements, sur le modèle de commitVersion (versions.ts).
const ESCALATION_METADATA_FILES = new Set([
  BACKLOG_FILE_NAME,
  LEXIQUE_FILE_NAME,
  ARCHITECTURE_FILE_NAME,
  HISTORY_FILE_NAME,
  MEMORY_FILE_NAME,
]);

const execFileAsync = promisify(execFile);

/** Chemins avec un changement non commité dans `dir` (porcelain v1, best-effort —
 *  fail-open vers un set vide si pas un repo git / erreur, ne bloque jamais). */
export async function gitDirtyPaths(dir: string): Promise<Set<string>> {
  try {
    const { stdout } = await execFileAsync("git", ["status", "--porcelain"], { cwd: dir });
    return new Set(
      stdout
        .split("\n")
        .map((l) => l.slice(3).trim()) // "XY path" (porcelain v1) → path
        .filter(Boolean),
    );
  } catch {
    return new Set();
  }
}

/** true si `after` contient un chemin absent de `before` et qui n'est PAS un
 *  fichier de métadonnées connu — c'est-à-dire un VRAI changement de code. */
export function hasRealCodeChange(before: Set<string>, after: Set<string>): boolean {
  for (const f of after) {
    if (before.has(f)) continue;
    if (ESCALATION_METADATA_FILES.has(f)) continue;
    return true;
  }
  return false;
}
