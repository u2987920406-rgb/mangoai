// Outils de l'Élève agentique (function-calling) — PHASE 1 : LECTURE SEULE.
//
// Aujourd'hui l'Élève ne sait qu'écrire/éditer via le contrat <mangoos> ; il ne
// peut PAS lire, lister ni chercher dans le projet. Ces outils comblent ce
// manque : branchés sur la boucle function-calling (askEleveAgentic), ils
// laissent l'Élève EXPLORER et raisonner comme Claude — read/list/search/build.
//
// Chaque outil est PROJET-SCOPÉ : buildEleveTools(projectDir) construit un
// ToolRegistry dont tous les handlers sont confinés au projet. La sécurité est
// calquée sur executor.ts (resolveInside) : défense en profondeur, le modèle ne
// peut pas sortir du périmètre. Phase 1 = aucune ÉCRITURE (write/run viendront en
// Phase 2, via les handlers sûrs d'executor.ts).

import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { ToolRegistry, type KernelTool } from "../kernel/kernel-mcp.js";
import { inspectProject } from "../inspection.js";
import { confinePath } from "../perimeter-context.js";

const MAX_READ = 24_000; // caractères max renvoyés par read_file (cap anti-saturation)
const MAX_LIST = 400; // fichiers max listés
const MAX_MATCHES = 60; // lignes max renvoyées par search_code
// Dossiers jamais explorés (bruit + volume).
const IGNORE = /(^|\/)(node_modules|\.git|dist|build|\.vite|\.diffs|\.gemma-snapshots)(\/|$)/;

/** Confinement de chemin au projet (calqué sur executor.resolveInside) : un
 * chemin résolu hors de la racine est refusé. Défense en profondeur.
 * (#180 É2) Outils LECTURE SEULE → accès `read` : gate OFF = byte-identique ;
 * gate ON = union des racines consenties (workspace + coffres lisibles). */
function resolveInside(root: string, rel: string): string {
  return confinePath(root, rel, "read");
}

/** Convertit un motif glob simple (`*`, `**`, `?`) en RegExp ancrée. Pure,
 * dépendance-free (2026-07-11, #182 suite — comble le seul vrai gap Glob vs
 * Claude : `list_files` listait tout, sans filtre par motif). */
export function globToRegExp(glob: string): RegExp {
  let re = "^";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        re += ".*";
        i++;
        if (glob[i + 1] === "/") i++; // "**/foo" → ne force pas un "/" littéral en trop
      } else {
        re += "[^/]*";
      }
    } else if (c === "?") {
      re += "[^/]";
    } else if (".+^${}()|[]\\".includes(c)) {
      re += "\\" + c;
    } else {
      re += c;
    }
  }
  return new RegExp(re + "$");
}

/** Liste récursive des fichiers (hors IGNORE), bornée à MAX_LIST. */
function walk(dir: string, root: string, out: string[]): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (out.length >= MAX_LIST) return;
    const abs = path.join(dir, entry.name);
    const rel = path.relative(root, abs).replace(/\\/g, "/");
    if (IGNORE.test("/" + rel)) continue;
    if (entry.isDirectory()) walk(abs, root, out);
    else out.push(rel);
  }
}

/** Construit le registre d'outils LECTURE SEULE borné à un projet. */
export function buildEleveTools(projectDir: string): ToolRegistry {
  const reg = new ToolRegistry();
  const root = path.resolve(projectDir);

  const tools: KernelTool[] = [
    {
      name: "read_file",
      description:
        "Lit le contenu d'un fichier du projet (chemin relatif, ex. src/App.jsx). Renvoie le texte, tronqué si très long.",
      inputSchema: { path: z.string().describe("Chemin relatif au projet, ex. src/App.jsx") },
      handler: (args) => {
        const rel = String(args.path ?? "");
        let abs: string;
        try {
          abs = resolveInside(root, rel);
        } catch (e) {
          return { text: (e as Error).message, isError: true };
        }
        if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
          return { text: `fichier introuvable : ${rel}`, isError: true };
        }
        let content: string;
        try {
          content = fs.readFileSync(abs, "utf8");
        } catch {
          return { text: `illisible (binaire ?) : ${rel}`, isError: true };
        }
        return {
          text:
            content.length > MAX_READ
              ? content.slice(0, MAX_READ) + `\n… [tronqué — ${content.length} caractères au total]`
              : content,
        };
      },
    },
    {
      name: "list_files",
      description:
        "Liste les fichiers du projet (récursif, hors node_modules/.git/dist). Argument optionnel `dir` pour un sous-dossier, `pattern` pour filtrer par motif glob (ex. 'src/**/*.tsx', '*.css') — équivalent de Glob.",
      inputSchema: {
        dir: z.string().optional().describe("Sous-dossier à lister (défaut : racine du projet)"),
        pattern: z.string().optional().describe("Motif glob de filtrage, relatif à la racine du projet (ex. 'src/**/*.tsx', '**/*.css')"),
      },
      handler: (args) => {
        const sub = args.dir ? String(args.dir) : ".";
        let base: string;
        try {
          base = resolveInside(root, sub);
        } catch (e) {
          return { text: (e as Error).message, isError: true };
        }
        if (!fs.existsSync(base)) return { text: `dossier introuvable : ${sub}`, isError: true };
        let out: string[] = [];
        walk(base, root, out);
        const pattern = args.pattern ? String(args.pattern).trim() : "";
        if (pattern) {
          let re: RegExp;
          try { re = globToRegExp(pattern); } catch { return { text: `motif glob invalide : ${pattern}`, isError: true }; }
          out = out.filter((f) => re.test(f));
        }
        if (!out.length) return { text: pattern ? `(aucun fichier ne correspond à « ${pattern} »)` : "(aucun fichier)" };
        return { text: out.join("\n") + (out.length >= MAX_LIST ? `\n… [limité à ${MAX_LIST} fichiers]` : "") };
      },
    },
    {
      name: "search_code",
      description:
        "Cherche un texte (ou motif regex) dans les fichiers du projet. Renvoie les lignes correspondantes au format fichier:ligne.",
      inputSchema: { query: z.string().describe("Texte ou motif regex à chercher") },
      handler: (args) => {
        const q = String(args.query ?? "");
        if (!q) return { text: "(requête vide)", isError: true };
        let re: RegExp | null;
        try {
          re = new RegExp(q, "i");
        } catch {
          re = null; // motif invalide → repli recherche littérale
        }
        const files: string[] = [];
        walk(root, root, files);
        const matches: string[] = [];
        for (const rel of files) {
          if (matches.length >= MAX_MATCHES) break;
          let content: string;
          try {
            content = fs.readFileSync(path.join(root, rel), "utf8");
          } catch {
            continue;
          }
          const lines = content.split("\n");
          for (let i = 0; i < lines.length; i++) {
            const hit = re ? re.test(lines[i]) : lines[i].toLowerCase().includes(q.toLowerCase());
            if (hit) {
              matches.push(`${rel}:${i + 1}: ${lines[i].trim().slice(0, 160)}`);
              if (matches.length >= MAX_MATCHES) break;
            }
          }
        }
        return {
          text: matches.length
            ? matches.join("\n") + (matches.length >= MAX_MATCHES ? `\n… [limité à ${MAX_MATCHES} résultats]` : "")
            : `(aucune correspondance pour : ${q})`,
        };
      },
    },
    {
      name: "check_build",
      description:
        "Lance le build du projet et renvoie le résultat objectif : vert, ou l'erreur exacte. Sert à VÉRIFIER l'état du projet.",
      inputSchema: {},
      handler: async () => {
        const insp = await inspectProject(projectDir);
        return insp.ok
          ? { text: `BUILD VERT (${insp.signal}, ${insp.durationMs}ms)` }
          : { text: `BUILD ÉCHEC [${insp.signal}]\n${(insp.detail ?? "").slice(-800)}`, isError: true };
      },
    },
  ];

  for (const t of tools) reg.register(t);
  return reg;
}
