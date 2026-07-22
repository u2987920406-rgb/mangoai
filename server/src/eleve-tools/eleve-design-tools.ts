// verifie_design (2026-07-12, #182 suite) — expose measureProjectDesign/measureSummary
// (design/design-metrics.ts : contraste WCAG, palette déclarée vs utilisée, familles de
// polices, échelle typographique, couleurs littérales, motion) comme un outil que
// l'Élève peut appeler LUI-MÊME EN COURS de tâche, comme check_build.
//
// Constat de l'audit du 2026-07-11 : ces fonctions PURES/déterministes tournaient déjà
// en interne (relay-closure.ts::measureCraftSummary, uniquement à la CLÔTURE, sur les
// seuls fichiers CHANGÉS). Claude, lui, peut auto-vérifier son rendu à tout moment via
// mcp__vision__snapshot. Ici : un coup d'œil design PENDANT le travail, sur TOUT le
// projet (pas seulement le diff), sans attendre la clôture.
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { type KernelTool, type KernelToolResult } from "../kernel/kernel-mcp.js";
import { measureProjectDesign, measureSummary } from "../design/design-metrics.js";

const STYLE_RE = /\.(css|scss)$/i;
const COMPONENT_RE = /\.(jsx|tsx)$/i;
const IGNORE = /(^|\/)(node_modules|\.git|dist|build|\.vite)(\/|$)/;
const MAX_FILES = 200;

/** Liste bornée des fichiers style/composants du projet (hors IGNORE). Pure.
 *  Exportée (2026-07-23) pour réutilisation par design-loop.ts — même scan,
 *  pas de duplication. */
export function scanFiles(root: string): { css: string[]; components: string[] } {
  const css: string[] = [];
  const components: string[] = [];
  const walk = (dir: string, depth: number): void => {
    if (depth > 8 || css.length + components.length >= MAX_FILES) return;
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const abs = path.join(dir, e.name);
      const rel = path.relative(root, abs).replace(/\\/g, "/");
      if (IGNORE.test("/" + rel)) continue;
      if (e.isDirectory()) { walk(abs, depth + 1); continue; }
      if (STYLE_RE.test(e.name)) css.push(abs);
      else if (COMPONENT_RE.test(e.name)) components.push(abs);
    }
  };
  walk(root, 0);
  return { css, components };
}

export function readSafe(p: string): string {
  try { return fs.readFileSync(p, "utf8"); } catch { return ""; }
}

export function buildEleveDesignTools(projectDir: string): KernelTool[] {
  return [
    {
      name: "verifie_design",
      description:
        "Vérifie le DESIGN du projet de façon DÉTERMINISTE (pas de LLM) : contraste WCAG AA, cohérence de palette (couleurs hors palette déclarée), nombre de familles de polices, présence d'une échelle typographique, couleurs littérales dans les composants (au lieu des custom properties), micro-interactions/motion. Appelle-le APRÈS avoir touché aux styles/composants, comme check_build mais pour le design — avant finish.",
      inputSchema: {},
      handler: async (): Promise<KernelToolResult> => {
        try {
          const { css, components } = scanFiles(projectDir);
          if (css.length === 0 && components.length === 0) {
            return { text: "Aucun fichier de style ou de composant trouvé — rien à vérifier." };
          }
          const measure = measureProjectDesign({
            cssFiles: css.map(readSafe).filter(Boolean),
            componentFiles: components.map(readSafe).filter(Boolean),
            indexHtml: readSafe(path.join(projectDir, "index.html")),
            packageJson: readSafe(path.join(projectDir, "package.json")),
          });
          const summary = measureSummary(measure);
          if (!summary) {
            return { text: `✓ Design conforme (${css.length} fichier(s) style, ${components.length} composant(s) vérifiés) — aucun écart détecté.` };
          }
          return { text: `Écarts de design détectés (${css.length} fichier(s) style, ${components.length} composant(s)) :\n${summary}\n\nCorrige ce qui est pertinent (edit_file), puis re-vérifie si besoin.` };
        } catch (e) {
          return { text: `verifie_design indisponible : ${(e as Error).message}`, isError: true };
        }
      },
    },
  ];
}
