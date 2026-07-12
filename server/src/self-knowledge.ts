// Conscience de SOI de MangoOS — « n'importe quel cerveau doit savoir ce que MangoOS
// sait faire, même quand cet outil précis n'est pas offert ce tour-ci ».
//
// Né d'un cas RÉEL (2026-07-12, Raf) : en discutant de MangoOS avec le cerveau actif
// (Qwythos, rôle `codeur`), Raf a découvert que le cerveau ne savait même pas que
// Sharingan existait — et soupçonne plus largement une incohérence dans le suivi des
// workflows établis (Gardien, hooks, boîte noire…). Cause racine : chaque compétence
// transmise à l'Élève (vois_ecran, chercher_web, planifier…) n'est documentée QUE dans
// la clause de contrat qui accompagne l'outil quand il est CHARGÉ ce tour-ci (Construire,
// agentic) — rien ne dit au cerveau, en Discuter ou en méta-conversation sur MangoOS
// lui-même, que ces systèmes EXISTENT dans l'architecture globale.
//
// Ce module comble ce trou avec un fichier UNIQUE, workspace-level, lu par N'IMPORTE
// QUEL cerveau à CHAQUE tour (Discuter ET Construire) : `.mangoos-competences.md`.
// Éditable directement (Raf ou Claude), pas figé dans le code — se met à jour comme
// n'importe quelle autre couche d'identité (cf. identity.ts, même patron).
import path from "node:path";
import fs from "node:fs";

export const SELF_KNOWLEDGE_FILE_NAME = ".mangoos-competences.md";
const SELF_KNOWLEDGE_MAX_CHARS = 4000;

/** Contenu de secours si le fichier est absent (ne devrait pas arriver — il est
 *  committé au workspace — mais fail-open comme toute source de fichier ici). */
const FALLBACK = `MangoOS a des capacités établies au-delà des outils offerts ce tour-ci : dis « je ne sais pas » plutôt que d'inventer, mais ne nie jamais l'existence d'un système MangoOS que tu ne reconnais pas — demande ou vérifie d'abord.`;

function loadCapped(file: string, maxChars: number): string {
  try {
    const text = fs.readFileSync(file, "utf8").trim();
    return text.length > maxChars
      ? `${text.slice(0, maxChars)}\n[... tronqué à ${maxChars} caractères — condense le fichier]`
      : text;
  } catch {
    return "";
  }
}

export function loadSelfKnowledge(workspaceDir: string): string {
  const content = loadCapped(path.join(workspaceDir, SELF_KNOWLEDGE_FILE_NAME), SELF_KNOWLEDGE_MAX_CHARS);
  return content || FALLBACK;
}

/** Section système TOUJOURS injectée (Discuter ET Construire, tout cerveau) — à la
 *  différence des autres couches d'identité (identity.ts), celle-ci n'est jamais ""
 *  : c'est un socle de conscience de soi, pas une donnée apprise optionnelle. */
export function selfKnowledgePromptSection(workspaceDir: string): string {
  const content = loadSelfKnowledge(workspaceDir);
  return `\n\n⚙ CE QUE MANGOOS SAIT FAIRE (conscience de soi — vrai même si l'outil précis n'est pas chargé ce tour-ci) :\n${content}\n⚠ Si on te demande si MangoOS/toi savez faire quelque chose de cette liste : dis OUI et explique comment (même si l'outil n'est pas actif ce tour-ci, il existe dans le système). Si on te parle d'un système MangoOS que tu ne reconnais PAS dans cette liste : dis que tu n'es pas sûr plutôt que de nier son existence — le système évolue plus vite que cette liste n'est mise à jour.`;
}
