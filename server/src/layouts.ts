// Cross-project LAYOUT library (L3 — « layouts comme type d'artefact DISTINCT »).
//
// Jusqu'ici un layout de page (l'AGENCEMENT d'une page : hero + bandeau + grille +
// pied, la composition spatiale d'ensemble) n'avait pas de magasin propre : soit il
// finissait en composant tagué « layout » dans .components (mélangé aux boutons et
// cartes), soit il était SKIP (« one-off page layouts » dans COMPONENTS_RULES). Or
// un layout est une chose RÉUTILISABLE d'une autre nature qu'un composant : pas une
// brique isolée à props, mais un SQUELETTE de page à remplir.
//
// On lui donne donc son propre type, sur le patron exact de components.ts :
//   workspace/.layouts/<LayoutName>/
//     - layout.tsx  — squelette JSX/TSX auto-contenu (zones, slots, structure)
//     - meta.json   — description, tags, structure (sections), usedIn, timestamps
//
// Frontière nette : COMPOSANT = brique réutilisable à props (SearchBar, Modal) ·
// LAYOUT = agencement de page entier (landing héro+features+CTA, dashboard
// sidebar+grille, magazine éditorial). Indexé dans le Blackboard (scope
// artifact:layout, embedding texte) et retrouvable par SENS via `chercher_artefact`.
import path from "node:path";
import fs from "node:fs";

export const LAYOUTS_DIR_NAME = ".layouts";

export interface LayoutMeta {
  name: string;        // PascalCase folder name
  description: string; // one-line purpose (ex. « landing produit héro + 3 features + CTA »)
  tags: string[];      // search/filter tokens (landing, dashboard, magazine, …)
  structure: string[]; // sections in order (ex. ["hero","features","testimonials","cta","footer"])
  usedIn: string[];    // which projects have used it
  createdAt: string;   // ISO timestamp
  updatedAt: string;   // ISO timestamp
}

export interface LayoutEntry {
  meta: LayoutMeta;
  code: string;
}

function layoutsDir(workspaceDir: string): string {
  return path.join(workspaceDir, LAYOUTS_DIR_NAME);
}

export function listLayouts(workspaceDir: string): LayoutMeta[] {
  try {
    const dir = layoutsDir(workspaceDir);
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const metas: LayoutMeta[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      try {
        const raw = fs.readFileSync(path.join(dir, entry.name, "meta.json"), "utf8");
        const m = JSON.parse(raw) as LayoutMeta;
        // Tolérance : un layout écrit par l'Élève peut omettre structure/tags.
        m.tags = Array.isArray(m.tags) ? m.tags : [];
        m.structure = Array.isArray(m.structure) ? m.structure : [];
        m.usedIn = Array.isArray(m.usedIn) ? m.usedIn : [];
        metas.push(m);
      } catch {
        // skip malformed entries
      }
    }
    return metas.sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

export function loadLayout(workspaceDir: string, name: string): LayoutEntry | null {
  const dir = path.join(layoutsDir(workspaceDir), name);
  try {
    const metaRaw = fs.readFileSync(path.join(dir, "meta.json"), "utf8");
    const code = fs.readFileSync(path.join(dir, "layout.tsx"), "utf8");
    return { meta: JSON.parse(metaRaw) as LayoutMeta, code };
  } catch {
    return null;
  }
}

export function saveLayout(workspaceDir: string, entry: LayoutEntry): void {
  const dir = path.join(layoutsDir(workspaceDir), entry.meta.name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "meta.json"), JSON.stringify(entry.meta, null, 2), "utf8");
  fs.writeFileSync(path.join(dir, "layout.tsx"), entry.code, "utf8");
}

export function deleteLayout(workspaceDir: string, name: string): void {
  const dir = path.join(layoutsDir(workspaceDir), name);
  fs.rmSync(dir, { recursive: true, force: true });
}

/** Cheap change detector (count + mtime of the directory). */
export function layoutsSnapshot(workspaceDir: string): string {
  try {
    const dir = layoutsDir(workspaceDir);
    const st = fs.statSync(dir);
    return `${listLayouts(workspaceDir).length}:${st.mtimeMs}`;
  } catch {
    return "";
  }
}

export const LAYOUTS_RULES = `
Cross-project LAYOUT library (workspace/${LAYOUTS_DIR_NAME}/):
- DISTINCT from the component library: a LAYOUT is a whole PAGE SKELETON (the spatial composition of a full page — e.g. a product landing = hero + features grid + testimonials + CTA + footer; a dashboard = sidebar + topbar + content grid; an editorial magazine layout), not a single reusable brick with props (that's a component). Each layout lives in its own folder: ${LAYOUTS_DIR_NAME}/<LayoutName>/layout.tsx (the skeleton) + meta.json ({"name", "description", "tags": [], "structure": ["hero","features",…], "usedIn": [], "createdAt": "ISO", "updatedAt": "ISO"}).
- PROPOSE: before composing a new full-page layout (a landing, a dashboard shell, a gallery page…), check the layouts listed below or via the chercher_artefact tool. If a matching skeleton exists, READ its code (workspace/${LAYOUTS_DIR_NAME}/<Name>/layout.tsx) and adapt its STRUCTURE to the current project (swap the visual identity, keep the proven composition). Mention what you reused.
- SAVE: when you build a clean, reusable full-page composition (a landing structure, a dashboard shell — generic structure, no project-specific copy hardcoded), save it: Write workspace/${LAYOUTS_DIR_NAME}/<LayoutName>/layout.tsx + meta.json with the ordered "structure" array. Use PascalCase.
- SKIP: single components (those go to .components/), and pages so specific to one project that the skeleton can't be reused.`;
