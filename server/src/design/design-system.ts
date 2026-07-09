// Cross-project design system (Chantier A — Roadmap haute couture).
// Persists the user's visual identity across ALL projects: palette, typography,
// component conventions, spacing rules. Lives at workspace/.design-system.md
// (same level as .axioms.md, .user-profile.md) so it survives project deletion.
// The agent reads it at every turn and updates it when the user validates a
// design decision.
import path from "node:path";
import fs from "node:fs";

export const DESIGN_SYSTEM_FILE_NAME = ".design-system.md";
const DESIGN_SYSTEM_MAX_CHARS = 4000;

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

export function loadDesignSystem(workspaceDir: string): string {
  return loadCapped(path.join(workspaceDir, DESIGN_SYSTEM_FILE_NAME), DESIGN_SYSTEM_MAX_CHARS);
}

export function saveDesignSystem(workspaceDir: string, content: string): void {
  fs.mkdirSync(workspaceDir, { recursive: true });
  fs.writeFileSync(path.join(workspaceDir, DESIGN_SYSTEM_FILE_NAME), content, "utf8");
}

export const DESIGN_SYSTEM_RULES = `
Cross-project design system (${DESIGN_SYSTEM_FILE_NAME}):
- This workspace-level file persists the user's visual identity across ALL projects — palette, typography, component conventions, spacing, visual style.
- Apply these defaults at the start of every new project without being asked; they are the baseline style.
- When the user validates a design choice or says "remember this for future projects" / "add this to the design system", update ${DESIGN_SYSTEM_FILE_NAME} immediately: Write or Edit it directly. Keep entries concise factual bullets; merge into existing sections (## Palette · ## Typographie · ## Composants · ## Conventions), never duplicate. Target < 2000 chars — curated, not exhaustive.
- If the file does not exist yet, create it with the first durable visual decision.`;

/** System-prompt section injecting the design system content ("" if empty). */
export function designSystemPromptSection(workspaceDir: string): string {
  const content = loadDesignSystem(workspaceDir);
  if (!content) return "";
  return `\n\nCross-project design system (${DESIGN_SYSTEM_FILE_NAME}) — apply these visual defaults to every project:\n${content}`;
}
