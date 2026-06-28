// L21 — donner au juge d'intention (#161) un VRAI diff de ce qui a changé,
// pas seulement le contenu intégral des fichiers. Pour un fichier MODIFIÉ d'un
// projet existant, le diff vs HEAD montre EXACTEMENT la modification (signal
// bien plus net pour juger l'adéquation). Pour un fichier NOUVEAU (pas dans HEAD,
// ou projet sans commit), il n'y a pas de diff → l'appelant retombe sur le contenu.
//
// Lecture SEULE : aucune mutation de l'index/historique du dépôt de l'app
// (`git diff HEAD -- <fichier>`). `run` est injectable → testable sans git réel.

import { execFileSync } from "node:child_process";

export type GitRun = (projectDir: string, args: string[]) => string | null;

/** Exécuteur git réel, read-only, borné. null si git absent / pas un dépôt / non-zéro. */
export const realGitRun: GitRun = (projectDir, args) => {
  try {
    return execFileSync("git", ["-C", projectDir, "--no-pager", ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"], // stderr ignoré (« not a git repo » → throw → null)
      timeout: 5000,
      maxBuffer: 4_000_000,
    });
  } catch {
    return null;
  }
};

/**
 * Diff unifié d'un fichier SUIVI vs HEAD (sa modification dans la tâche courante).
 * Renvoie le patch (non vide) ou null : pas de dépôt / pas de HEAD / fichier nouveau
 * ou inchangé → null (l'appelant retombe alors sur le contenu intégral). PUR (run injecté).
 */
export function gitFileDiff(projectDir: string, rel: string, run: GitRun = realGitRun): string | null {
  const out = run(projectDir, ["diff", "HEAD", "--", rel]);
  const t = (out ?? "").trim();
  return t ? t : null;
}
