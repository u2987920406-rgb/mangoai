// Cross-project component library (Idée #36 — Bibliothèque de composants inter-projets).
// 5th knowledge store: reusable React/JSX/TSX components shared across ALL projects.
// Unlike skills (textual know-how) and the design system (visual identity), components
// are EXECUTABLE code — a validated component from project A is proposed and adapted in B.
//
// Structure: workspace/.components/<ComponentName>/
//   - component.tsx  — self-contained JSX/TSX source
//   - meta.json      — description, tags, props, usedIn, timestamps
import path from "node:path";
import fs from "node:fs";
import { isSafeSlug } from "./references.js";

export const COMPONENTS_DIR_NAME = ".components";

/** (Un, 2026-07-03) U1 — anti path-traversal : `name` vient du client (meta.name
 * ou :name d'URL) et finissait BRUT dans path.join → `../../x` permettait de
 * lire/écrire/supprimer HORS de .components (RCE via écrasement de fichiers
 * serveur). On réutilise EXACTEMENT la garde isSafeSlug de references.ts, en
 * tolérant le PascalCase des composants via un lowercase de validation. */
export function isSafeComponentName(name: string): boolean {
  return isSafeSlug(name.toLowerCase());
}

export interface ComponentMeta {
  name: string;        // PascalCase folder name
  description: string; // one-line purpose
  tags: string[];      // search/filter tokens
  props: string[];     // main public props
  usedIn: string[];    // which projects have used it
  createdAt: string;   // ISO timestamp
  updatedAt: string;   // ISO timestamp
}

export interface ComponentEntry {
  meta: ComponentMeta;
  code: string;
}

function componentsDir(workspaceDir: string): string {
  return path.join(workspaceDir, COMPONENTS_DIR_NAME);
}

export function listComponents(workspaceDir: string): ComponentMeta[] {
  try {
    const dir = componentsDir(workspaceDir);
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const metas: ComponentMeta[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      try {
        const raw = fs.readFileSync(path.join(dir, entry.name, "meta.json"), "utf8");
        metas.push(JSON.parse(raw) as ComponentMeta);
      } catch {
        // skip malformed entries
      }
    }
    return metas.sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

export function loadComponent(workspaceDir: string, name: string): ComponentEntry | null {
  if (!isSafeComponentName(name)) return null; // (Un, 2026-07-03) U1 — pas de lecture hors .components
  const dir = path.join(componentsDir(workspaceDir), name);
  try {
    const metaRaw = fs.readFileSync(path.join(dir, "meta.json"), "utf8");
    const code = fs.readFileSync(path.join(dir, "component.tsx"), "utf8");
    return { meta: JSON.parse(metaRaw) as ComponentMeta, code };
  } catch {
    return null;
  }
}

export function saveComponent(workspaceDir: string, entry: ComponentEntry): void {
  // (Un, 2026-07-03) U1 — un meta.name du type "../../server/src/x" écrirait hors du store
  if (!isSafeComponentName(entry.meta.name)) {
    throw new Error(`nom de composant invalide : "${entry.meta.name}"`);
  }
  const dir = path.join(componentsDir(workspaceDir), entry.meta.name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "meta.json"), JSON.stringify(entry.meta, null, 2), "utf8");
  fs.writeFileSync(path.join(dir, "component.tsx"), entry.code, "utf8");
}

export function deleteComponent(workspaceDir: string, name: string): void {
  // (Un, 2026-07-03) U1 — rmSync récursif sur un nom brut = suppression arbitraire
  if (!isSafeComponentName(name)) {
    throw new Error(`nom de composant invalide : "${name}"`);
  }
  const dir = path.join(componentsDir(workspaceDir), name);
  fs.rmSync(dir, { recursive: true, force: true });
}

/** Cheap change detector (count + mtime of the directory). */
export function componentsSnapshot(workspaceDir: string): string {
  try {
    const dir = componentsDir(workspaceDir);
    const st = fs.statSync(dir);
    return `${listComponents(workspaceDir).length}:${st.mtimeMs}`;
  } catch {
    return "";
  }
}

/** System-prompt section listing available components ("" if none). */
export function componentsPromptSection(workspaceDir: string): string {
  const list = listComponents(workspaceDir);
  if (list.length === 0) return "";
  const lines = list.map((c) => {
    const tagStr = c.tags.length ? ` [${c.tags.join(", ")}]` : "";
    const propStr = c.props.length ? ` — props: ${c.props.join(", ")}` : "";
    return `- **${c.name}**: ${c.description}${tagStr}${propStr}`;
  });
  return (
    `\n\nAvailable cross-project components (${list.length} total — read workspace/${COMPONENTS_DIR_NAME}/<Name>/component.tsx to reuse):\n` +
    lines.join("\n")
  );
}

export const COMPONENTS_RULES = `
Cross-project component library (workspace/${COMPONENTS_DIR_NAME}/):
- This workspace-level store holds REUSABLE React/JSX components shared across ALL projects. Each component has its own folder: ${COMPONENTS_DIR_NAME}/<ComponentName>/component.tsx (the code) + meta.json ({"name", "description", "tags": [], "props": [], "usedIn": [], "createdAt": "ISO", "updatedAt": "ISO"}).
- PROPOSE: before coding a common UI element (search bar, data table, modal, accordion, pagination, card grid, form field, etc.), check the list injected below. If a matching component exists, READ its code (workspace/${COMPONENTS_DIR_NAME}/<Name>/component.tsx) and adapt it to the current project — never duplicate working code across projects. Mention what you reused.
- SAVE: when you build a new component that is clearly reusable (≥ 20 lines, clean props API, no project-specific data or domain logic hardcoded), save it immediately: Write workspace/${COMPONENTS_DIR_NAME}/<ComponentName>/component.tsx (self-contained JSX/TSX, TypeScript props interface preferred) and workspace/${COMPONENTS_DIR_NAME}/<ComponentName>/meta.json. Use PascalCase for the folder/name.
- UPDATE: when you improve an existing component in a new project, update both files and add the current project to usedIn[].
- SKIP: domain-specific components (tied to one project's data model), trivial wrappers (< 20 lines), and one-off page layouts.`;
