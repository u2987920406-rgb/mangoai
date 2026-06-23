// Outils d'ACTION de l'Élève agentique (function-calling) — PHASE 2.
//
// La Phase 1 (eleve-tools.ts) a donné à l'Élève la LECTURE (read/list/search/
// check_build). Ici on ajoute l'ACTION : write_file, edit_file, run_command, et
// la sentinelle finish. C'est ce qui transforme la boucle « explore et conclus »
// en un vrai MOTEUR DE BUILD — l'Élève écrit, vérifie (check_build), lit son
// erreur, corrige, recommence, comme Claude.
//
// SÉCURITÉ : aucun nouveau périmètre. Chaque outil d'écriture délègue aux
// primitives sûres d'executor.ts (applyWrite/applyEdit/applyRun → executeContract),
// donc resolveInside (confinement), FORBIDDEN_RUN (blacklist), timeout et la garde
// d'ambiguïté du <find> sont réutilisés tels quels. Un échec d'outil n'interrompt
// PAS la boucle : il revient au modèle (isError) qui se corrige tout seul.

import { z } from "zod";
import { ToolRegistry, type KernelTool, type KernelToolResult } from "./kernel-mcp.js";
import { buildEleveTools } from "./eleve-tools.js";
import { applyWrite, applyEdit, applyRun } from "./executor.js";

/** Timeout d'une commande lancée par l'Élève (défaut 120 s, surchargeable). */
const RUN_TIMEOUT_MS = Number(process.env.ELEVE_RUN_TIMEOUT_MS ?? 120_000);

/** Wrap un appel pouvant lever en KernelToolResult (l'erreur revient au modèle). */
async function guarded(fn: () => Promise<string>): Promise<KernelToolResult> {
  try {
    return { text: await fn() };
  } catch (e) {
    return { text: (e as Error).message, isError: true };
  }
}

/**
 * Registre COMPLET de l'Élève agentique : les 4 outils lecture (Phase 1) PLUS
 * les outils d'action. Tout est projet-scopé via `projectDir`.
 *
 * `finish` est une SENTINELLE : son handler ne fait qu'accuser réception du
 * résumé ; c'est la boucle runtime (buildAgentic, Phase B) qui détecte cet
 * appel pour TERMINER proprement le build. Signal de fin explicite, plus fiable
 * qu'un simple « plus aucun tool_call ».
 */
/** Politique d'outils (Phase E3) : gate les outils SENSIBLES selon la force MESURÉE
 * du cerveau. Un cerveau au function-calling moins fiable (frontière #135) reçoit un
 * sous-ensemble sûr : pas de shell libre (run_command) — qui est aussi le piège de
 * tâtonnement Windows déjà durci. Défaut = tout permis (rétrocompatible). */
export interface ToolPolicy {
  /** Autorise run_command (shell libre). false → l'Élève n'a que read/write/edit/check_build/finish. */
  allowRun?: boolean;
}

export function buildEleveActionTools(projectDir: string, policy: ToolPolicy = {}): ToolRegistry {
  const allowRun = policy.allowRun ?? true;
  // On réutilise et on ÉTEND le registre lecture seule (même instance).
  const reg = buildEleveTools(projectDir);

  const actionTools: KernelTool[] = [
    {
      name: "write_file",
      description:
        "Crée ou écrase un fichier complet du projet. Utilise-le pour un nouveau fichier ou une réécriture entière. Chemin relatif (ex. src/App.jsx).",
      inputSchema: {
        path: z.string().describe("Chemin relatif au projet, ex. src/App.jsx"),
        content: z.string().describe("Contenu complet du fichier"),
      },
      handler: (args) => guarded(() => applyWrite(projectDir, String(args.path ?? ""), String(args.content ?? ""))),
    },
    {
      name: "edit_file",
      description:
        "Remplace un extrait PRÉCIS d'un fichier existant. `find` doit apparaître EXACTEMENT une fois (sinon erreur — élargis le contexte). Préfère write_file pour de gros changements.",
      inputSchema: {
        path: z.string().describe("Chemin relatif au projet"),
        find: z.string().describe("Extrait exact à remplacer (doit être unique dans le fichier)"),
        replace: z.string().describe("Texte de remplacement"),
      },
      handler: (args) =>
        guarded(() =>
          applyEdit(projectDir, String(args.path ?? ""), String(args.find ?? ""), String(args.replace ?? "")),
        ),
    },
    {
      name: "run_command",
      description:
        "Lance une commande shell dans le projet (ex. `npx tsc --noEmit`). INTERDIT : npm install, git, rm -rf, et autres commandes destructrices. Renvoie le code de sortie et la sortie.",
      inputSchema: { command: z.string().describe("La commande shell à exécuter") },
      handler: (args) => guarded(() => applyRun(projectDir, String(args.command ?? ""), RUN_TIMEOUT_MS)),
    },
    {
      name: "finish",
      description:
        "Appelle ceci UNIQUEMENT quand la tâche est terminée et que le build est vert. Donne un court résumé de ce que tu as fait.",
      inputSchema: { summary: z.string().describe("Résumé de ce qui a été réalisé") },
      handler: (args) => ({ text: String(args.summary ?? "Terminé.") }),
    },
  ];

  for (const t of actionTools) {
    if (t.name === "run_command" && !allowRun) continue; // gaté pour cerveau faible
    reg.register(t);
  }
  return reg;
}

/** Vrai si l'outil nommé est la sentinelle de fin (utilisé par le runtime). */
export const FINISH_TOOL = "finish";
