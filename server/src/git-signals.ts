// Signaux git de l'escalade (extrait de eleve.ts, comportement inchangé).
// Sert à distinguer un VRAI changement de code d'un simple fichier de métadonnées
// lorsque le Maître (Claude) a « répondu » : évite un faux « résolu par le Maître,
// +1 axiome » alors que zéro ligne de code n'a été écrite (correctif L113).
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { BACKLOG_FILE_NAME } from "./project-backlog.js";
import { LEXIQUE_FILE_NAME } from "./lexique.js";
import { ARCHITECTURE_FILE_NAME } from "./architecture.js";
import { HISTORY_FILE_NAME } from "./history.js";
import { MEMORY_FILE_NAME } from "./memory.js";
import { TURN_LEDGER_FILE_NAME } from "./turn-ledger.js";

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

/** CHANTIER 5b — le TOUR a-t-il produit du code ? Mesure fiable, independante du
 *  moment ou l'escalade survient et de l'etat git (mesure 2026-09-30, 3 runs reels :
 *  le projet est cree PAR LE RUN, donc `git rev-parse` au demarrage ne voit encore
 *  aucun depot, et `git status` est propre des que le tour a committe).
 *
 *  Ancres rejetees, avec la raison :
 *   - HEAD avant/apres : lu avant la creation du depot -> "" -> inexploitable ;
 *   - `git status` sale : faux des que le tour a committe (c'est le cas normal) ;
 *   - dernier commit : faux sur un tour de correction qui ne committe qu'a la fin.
 *
 *  Ancre retenue : l'horodatage de DEBUT DE TOUR (.turn-ledger.json, ecrit
 *  synchroniquement par la route des l'ouverture du dossier). Tout fichier de code
 *  du projet modifie APRES cet instant est du travail de ce tour. */
export async function tourAProduitDuCode(projectDir: string, startedAtMs: number): Promise<boolean> {
  if (!Number.isFinite(startedAtMs) || startedAtMs <= 0) return false;
  const CODE = [".ts", ".tsx", ".js", ".jsx", ".css", ".html", ".mjs", ".cjs", ".json", ".vue", ".svelte"];
  const IGNORE = /(^|\/)(node_modules|\.git|dist|build|coverage)(\/|$)/;
  const METADATA = new Set([...ESCALATION_METADATA_FILES, TURN_LEDGER_FILE_NAME, ".tmp-exports.txt", ".tmp-index-dump.txt"]);
  let fichiers: string[] = [];
  try {
    const { stdout } = await execFileAsync("git", ["ls-files"], { cwd: projectDir });
    fichiers = stdout.split("\n").map((l) => l.trim()).filter(Boolean);
  } catch {
    fichiers = [];
  }
  if (fichiers.length === 0) {
    // pas de depot git : parcours direct, borne, des sources du projet.
    const marche = (d: string, prof = 0): void => {
      if (prof > 6) return;
      let entrees: import("node:fs").Dirent[] = [];
      try { entrees = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
      for (const e of entrees) {
        const p = path.join(d, e.name);
        const rel = path.relative(projectDir, p).replaceAll("\\", "/");
        if (IGNORE.test(rel)) continue;
        if (e.isDirectory()) marche(p, prof + 1);
        else if (CODE.some((x) => e.name.endsWith(x))) fichiers.push(rel);
      }
    };
    marche(projectDir);
  }
  for (const rel of fichiers) {
    if (IGNORE.test(rel)) continue;
    const base = rel.split("/").pop() ?? rel;
    if (METADATA.has(base) || METADATA.has(rel)) continue;
    if (!CODE.some((x) => rel.endsWith(x))) continue;
    try {
      const st = fs.statSync(path.join(projectDir, rel));
      if (st.mtimeMs >= startedAtMs) return true;
    } catch { /* fichier disparu : ignorer */ }
  }
  return false;
}
