// Matching tolérant aux fins de ligne pour edit_file (applyEdit).
//
// Bug mesuré (2026-06-28) : les fichiers d'un worktree sont en CRLF (Windows, git autocrlf),
// mais les modèles émettent un `find` en LF (`\n`) → `before.indexOf(find)` ne matche JAMAIS →
// « extrait <find> introuvable » → diff vide. Constaté sur gemma, qwen2.5-coder ET Gemini (qui
// se ré-corrigeait pourtant) : ce n'était pas (que) la faiblesse des modèles, c'était ce mur.
//
// Remède : essayer le `find` TEL QUEL (rétro-compat : un modèle qui copie le CRLF verbatim
// marche comme avant), puis, à défaut, ALIGNER ses fins de ligne sur la convention du fichier.
// `replace` est aligné de la même façon → le texte inséré respecte la convention du fichier.
// PUR, déterministe. Conserve les gardes : introuvable / ambigu (find présent 2+ fois).

/** Aligne les fins de ligne de `s` sur celles du fichier (CRLF si le fichier en a, sinon LF). */
function alignEol(s: string, fileUsesCRLF: boolean): string {
  const lf = s.replace(/\r\n/g, "\n");
  return fileUsesCRLF ? lf.replace(/\n/g, "\r\n") : lf;
}

export type EditResult =
  | { ok: true; after: string; aligned: boolean }
  | { ok: false; reason: "introuvable" | "ambigu" };

/**
 * Calcule le contenu après remplacement de `find` par `replace` dans `before`. Essaie le `find`
 * exact d'abord, puis aligné sur la convention de fin de ligne du fichier. Refuse si introuvable
 * ou ambigu (2+ occurrences). Ne touche PAS au disque (pur).
 */
export function resolveEdit(before: string, find: string, replace: string): EditResult {
  const fileUsesCRLF = /\r\n/.test(before);
  const candidates: Array<{ f: string; r: string; aligned: boolean }> = [{ f: find, r: replace, aligned: false }];
  const alignedFind = alignEol(find, fileUsesCRLF);
  if (alignedFind !== find) candidates.push({ f: alignedFind, r: alignEol(replace, fileUsesCRLF), aligned: true });

  for (const { f, r, aligned } of candidates) {
    if (f === "") continue; // un find vide n'a pas de sens
    const idx = before.indexOf(f);
    if (idx === -1) continue;
    if (before.indexOf(f, idx + f.length) !== -1) return { ok: false, reason: "ambigu" };
    return { ok: true, after: before.slice(0, idx) + r + before.slice(idx + f.length), aligned };
  }
  return { ok: false, reason: "introuvable" };
}
