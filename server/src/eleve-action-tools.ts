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

import { spawn } from "node:child_process";
import { z } from "zod";
import { ToolRegistry, type KernelTool, type KernelToolResult } from "./kernel-mcp.js";
import { buildEleveTools } from "./eleve-tools.js";
import { buildEleveVisionTools } from "./eleve-vision-tools.js";
import { applyWrite, applyEdit, applyRun } from "./executor.js";
import { searchPexelsImages, pexelsConfigured, loremflickrUrl } from "./taste-images.js";

/** Timeout d'une commande lancée par l'Élève (défaut 120 s, surchargeable). */
const RUN_TIMEOUT_MS = Number(process.env.ELEVE_RUN_TIMEOUT_MS ?? 120_000);
/** Timeout d'un `npm install <pkg>` (réseau → marge large). */
const ADD_DEP_TIMEOUT_MS = Number(process.env.ELEVE_ADD_DEP_TIMEOUT_MS ?? 180_000);

// add_dependency (#146, 2026-06-24) : le moteur interdit `npm install` libre (sécurité),
// mais l'agent a besoin de VRAIES libs (ex. lucide-react pour des icônes) — sans ça il
// écrit des imports non résolus → app cassée. On lui donne un outil d'install CURÉ : une
// ALLOWLIST de libs front populaires et sûres, installées via npm --save (donc persistées
// dans package.json → build reproductible). Hors liste → refus, écris sans lib externe.
export const SAFE_DEPENDENCIES = new Set<string>([
  // icônes / classes utilitaires
  "lucide-react", "react-icons", "clsx", "classnames", "tailwind-merge",
  // état
  "zustand", "jotai", "immer",
  // dates
  "date-fns", "dayjs",
  // graphes
  "recharts", "chart.js", "react-chartjs-2",
  // formulaires / validation
  "react-hook-form", "zod", "yup",
  // routage / data
  "react-router-dom", "axios", "swr", "@tanstack/react-query",
  // animation / ids / utils
  "framer-motion", "nanoid", "uuid", "lodash-es",
]);

/** Nom de paquet acceptable ET dans l'allowlist (double garde : pas d'injection shell). */
export function isAllowedDependency(pkg: string): boolean {
  return /^[@a-z0-9][@a-z0-9/._-]*$/.test(pkg) && SAFE_DEPENDENCIES.has(pkg);
}

/** `npm install <pkg> --save` borné, dans le projet (pkg DÉJÀ validé par l'allowlist). */
function npmAdd(projectDir: string, pkg: string, timeoutMs: number): Promise<{ ok: boolean; output: string }> {
  return new Promise((resolve) => {
    const p = spawn(`npm install ${pkg} --save`, { cwd: projectDir, shell: true, windowsHide: true });
    let out = "";
    p.stdout?.on("data", (d) => (out += d.toString()));
    p.stderr?.on("data", (d) => (out += d.toString()));
    const timer = setTimeout(() => {
      p.kill();
      resolve({ ok: false, output: "timeout — npm install trop long" });
    }, timeoutMs);
    p.on("exit", (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, output: out.slice(-2000) });
    });
    p.on("error", (e) => {
      clearTimeout(timer);
      resolve({ ok: false, output: (e as Error).message });
    });
  });
}

// Garde anti-shell-lecture (#146 révision 2026-06-24) : run_command sert AUX BUILDS,
// jamais à LIRE/lister un fichier. GLM contournait l'anti-sur-exploration en lisant
// via `powershell Get-Content … | Select-Object` (qui réussit → échappe à toutes les
// gardes). On REFUSE déterministement ces commandes de lecture/listing et on le
// renvoie vers les bons outils. Tokens repérés comme MOT (début / après pipe / espace).
const SHELL_READ_PATTERN =
  /(?:^|[\s|;&(])(get-content|gc|cat|type|more|head|tail|nl|ls|dir|gci|get-childitem|tree|select-string|sls|findstr|grep|select-object|get-location|pwd)(?=$|[\s|;&)])/i;

/** Vrai si la commande shell ne sert qu'à LIRE/lister (interdit : utiliser read_file). */
export function isShellReadCommand(command: string): boolean {
  return SHELL_READ_PATTERN.test(command);
}

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
      handler: (args) => {
        const command = String(args.command ?? "");
        // Refus déterministe : lire/lister via le shell est INTERDIT (anti-tâtonnement
        // Windows). Renvoie une erreur pédagogique vers les bons outils — l'isError
        // alimente aussi la garde anti-tâtonnement du runtime.
        if (isShellReadCommand(command)) {
          return Promise.resolve<KernelToolResult>({
            text:
              "⚠ run_command est INTERDIT pour LIRE ou lister un fichier (cat / type / Get-Content / ls / dir / " +
              "Select-Object / findstr…) — sous Windows ça tâtonne. Utilise read_file pour lire, list_files pour " +
              "lister, search_code pour chercher. Réserve run_command aux builds/vérifs (npx tsc --noEmit, npx vite build).",
            isError: true,
          });
        }
        return guarded(() => applyRun(projectDir, command, RUN_TIMEOUT_MS));
      },
    },
    {
      name: "add_dependency",
      description:
        "Installe une dépendance npm du PROJET (depuis une liste de libs autorisées) et l'ajoute à package.json. " +
        "Appelle-le AVANT d'importer une lib externe (ex. add_dependency('lucide-react') avant d'importer des icônes). " +
        "Si la lib n'est pas autorisée, écris le code SANS elle (ex. SVG inline pour des icônes). N'utilise JAMAIS run_command pour installer.",
      inputSchema: { package: z.string().describe("Nom exact du paquet npm, ex. lucide-react") },
      handler: async (args): Promise<KernelToolResult> => {
        const pkg = String(args.package ?? "").trim();
        if (!isAllowedDependency(pkg)) {
          return {
            text:
              `⚠ "${pkg}" n'est pas dans la liste des dépendances autorisées. Permises : ${[...SAFE_DEPENDENCIES].join(", ")}. ` +
              "Sinon, écris le code SANS lib externe (ex. SVG inline pour des icônes).",
            isError: true,
          };
        }
        const r = await npmAdd(projectDir, pkg, ADD_DEP_TIMEOUT_MS);
        if (!r.ok) return { text: `Échec de l'installation de ${pkg} : ${r.output}`, isError: true };
        return { text: `✓ ${pkg} installé et ajouté à package.json. Tu peux maintenant l'importer.` };
      },
    },
    {
      // chercher_image (#153) — souveraineté : l'Élève trouve de VRAIES photos pertinentes
      // (Pexels) au lieu de coller des placeholders aléatoires (picsum/loremflickr) qui ne
      // collent jamais à la scène. Donne 1-3 URLs prêtes à mettre dans le code.
      name: "chercher_image",
      description:
        "Trouve de VRAIES photos pertinentes pour une scène, via Pexels (gratuit). Donne une description en ANGLAIS de ce que doit montrer l'image (ex. 'waiter pouring water into a glass', 'woman typing on a laptop at her desk'). Renvoie 1 à 3 URLs d'images réelles à utiliser directement dans le code (src d'une <img> ou background). NE colle JAMAIS de placeholder aléatoire (picsum.photos, loremflickr, via.placeholder) quand une image doit représenter quelque chose de précis : utilise CET outil.",
      inputSchema: {
        scene: z.string().describe("Description ANGLAISE de la scène à illustrer, en mots-clés (ex. 'two people shaking hands in an office')"),
        n: z.number().int().min(1).max(3).optional().describe("Nombre d'images voulu (1 à 3, défaut 1)"),
      },
      handler: async (args): Promise<KernelToolResult> => {
        const scene = String(args.scene ?? "").trim();
        if (!scene) return { text: "Donne une description de la scène (en anglais, mots-clés).", isError: true };
        const n = Math.min(3, Math.max(1, Number(args.n ?? 1)));
        if (!pexelsConfigured()) {
          // Pas de clé Pexels : repli honnête (loremflickr thématique) plutôt qu'aléatoire pur.
          const url = loremflickrUrl(scene, scene.length, 800, 600);
          return { text: `Pexels non configuré (PEXELS_API_KEY absente). Repli thématique :\n${url}` };
        }
        const results = await searchPexelsImages(scene, n);
        if (results.length === 0) {
          return { text: `Aucune photo trouvée pour « ${scene} ». Reformule en mots-clés plus simples (ex. moins de mots, sujet concret).`, isError: true };
        }
        const lines = results.map((r, i) => `${i + 1}. ${r.url}${r.alt ? `  (${r.alt})` : ""}`);
        return { text: `Photos réelles pour « ${scene} » (Pexels — utilise une de ces URLs telle quelle) :\n${lines.join("\n")}` };
      },
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

  // Sharingan de l'Élève — l'œil sur son propre rendu (opt-in ELEVE_VISION=on,
  // défaut OFF → zéro régression). Profite aussi aux sous-agents délégués.
  if (process.env.ELEVE_VISION === "on") {
    for (const t of buildEleveVisionTools(projectDir)) reg.register(t);
  }

  return reg;
}

/** Vrai si l'outil nommé est la sentinelle de fin (utilisé par le runtime). */
export const FINISH_TOOL = "finish";
