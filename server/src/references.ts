// Idée #50 — Banque de références perso : mood library réutilisable au niveau
// workspace (screenshots / URLs / palettes d'inspiration). Même pattern que la
// bibliothèque de composants inter-projets (#36) mais pour les INSPIRATIONS.
// Les références deviennent un capital réutilisé au démarrage des projets
// (cadrage #47/#48).
//
// Structure: workspace/.references/<slug>/
//   - meta.json  — titre, kind, url, image, palette, tags, note, usedIn, timestamps
//   - <image>    — fichier image optionnel référencé par meta.image
import path from "node:path";
import fs from "node:fs";

export const REFERENCES_DIR_NAME = ".references";

export interface ReferenceMeta {
  slug: string;       // kebab-case unique identifier
  title: string;      // human-readable name
  kind: "url" | "image" | "palette";
  url?: string;       // for kind=url
  image?: string;     // filename of the stored image (e.g. "shot.png")
  palette: string[];  // hex colors, e.g. ["#1A1A2E", "#FF6B35"]
  ambiance?: string;  // freetext mood descriptor
  tags: string[];     // search/filter tokens
  note?: string;      // optional freetext note
  usedIn: string[];   // project names that have reused this reference
  createdAt: string;  // ISO timestamp
  updatedAt: string;  // ISO timestamp
}

/** Local slugify — kebab-case ASCII-safe, no path-traversal chars. */
function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")   // strip accents
    .replace(/[^a-z0-9]+/g, "-")       // non-alphanumeric → dash
    .replace(/^-+|-+$/g, "")           // trim leading/trailing dashes
    .slice(0, 80);
}

/** Guard against path-traversal: slug must be a single safe path segment.
 * (Un, 2026-07-03) U1 — exporté pour être réutilisé par components.ts /
 * library-routes.ts : même garde partout, pas de ré-implémentation divergente. */
export function isSafeSlug(slug: string): boolean {
  if (!slug) return false;
  // Must not contain separators or traversal sequences
  if (/[/\\]/.test(slug)) return false;
  if (slug === ".." || slug.startsWith("../") || slug.startsWith("..\\")) return false;
  // Slugify form: only lowercase, digits and dashes
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) return false;
  return true;
}

function refsDir(workspaceDir: string): string {
  return path.join(workspaceDir, REFERENCES_DIR_NAME);
}

export function listReferences(workspaceDir: string): ReferenceMeta[] {
  try {
    const dir = refsDir(workspaceDir);
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const metas: ReferenceMeta[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      try {
        const raw = fs.readFileSync(path.join(dir, entry.name, "meta.json"), "utf8");
        metas.push(JSON.parse(raw) as ReferenceMeta);
      } catch {
        // skip malformed entries
      }
    }
    return metas.sort((a, b) => a.title.localeCompare(b.title));
  } catch {
    return [];
  }
}

export function loadReference(workspaceDir: string, slug: string): ReferenceMeta | null {
  if (!isSafeSlug(slug)) return null;
  const dir = path.join(refsDir(workspaceDir), slug);
  // Double-check resolved path stays inside .references
  const base = path.resolve(refsDir(workspaceDir));
  const resolved = path.resolve(dir);
  if (!resolved.startsWith(base + path.sep) && resolved !== base) return null;
  try {
    const raw = fs.readFileSync(path.join(dir, "meta.json"), "utf8");
    return JSON.parse(raw) as ReferenceMeta;
  } catch {
    return null;
  }
}

export function saveReference(workspaceDir: string, meta: ReferenceMeta): void {
  const safeSlug = slugify(meta.slug || meta.title);
  const dir = path.join(refsDir(workspaceDir), safeSlug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "meta.json"), JSON.stringify({ ...meta, slug: safeSlug }, null, 2), "utf8");
}

export function deleteReference(workspaceDir: string, slug: string): void {
  if (!isSafeSlug(slug)) return;
  const dir = path.join(refsDir(workspaceDir), slug);
  fs.rmSync(dir, { recursive: true, force: true });
}

/**
 * Returns the absolute path of the stored image file if it exists, null otherwise.
 * Used to serve the image via res.sendFile.
 */
export function referenceImagePath(workspaceDir: string, slug: string): string | null {
  const meta = loadReference(workspaceDir, slug);
  if (!meta?.image) return null;
  const imgPath = path.join(refsDir(workspaceDir), slug, meta.image);
  if (fs.existsSync(imgPath)) return imgPath;
  return null;
}

/** Cheap change detector (count + mtime of the directory). */
export function referencesSnapshot(workspaceDir: string): string {
  try {
    const dir = refsDir(workspaceDir);
    const st = fs.statSync(dir);
    return `${listReferences(workspaceDir).length}:${st.mtimeMs}`;
  } catch {
    return "";
  }
}

/** System-prompt section listing available references ("" if none). */
export function referencesPromptSection(workspaceDir: string): string {
  const list = listReferences(workspaceDir);
  if (list.length === 0) return "";
  const lines = list.map((r) => {
    const urlPart = r.url ? ` — ${r.url}` : "";
    const tagStr = r.tags.length ? ` [${r.tags.join(", ")}]` : "";
    const palettePart = r.palette.length ? ` — palette: ${r.palette.join(", ")}` : "";
    const notePart = r.note ? ` — ${r.note}` : "";
    return `- **${r.title}** (${r.kind})${urlPart}${tagStr}${palettePart}${notePart}`;
  });
  return (
    `\n\nMood library — saved design references (${list.length} total — reuse at cadrage):\n` +
    lines.join("\n")
  );
}

export const REFERENCES_RULES = `
Mood library — workspace design references (workspace/${REFERENCES_DIR_NAME}/):
- This workspace-level store holds REUSABLE design inspirations shared across ALL projects. Each reference has its own folder: ${REFERENCES_DIR_NAME}/<slug>/meta.json ({"slug", "title", "kind": "url"|"image"|"palette", "url"?, "image"?, "palette": [], "ambiance"?, "tags": [], "note"?, "usedIn": [], "createdAt": "ISO", "updatedAt": "ISO"}).
- (a) PROPOSE — at the cadrage of a new project, look at the mood library injected below. If a saved reference matches the domain, ambiance or palette the user is aiming for, propose it and apply its palette/URL (capture via mcp__vision__sharingan_url if kind=url). Mention what you reused.
- (b) SAVE — when the user provides or validates a good reusable inspiration (a captured leader URL, an ambiance image, a palette validated in Le Miroir), save it: Write workspace/${REFERENCES_DIR_NAME}/<slug>/meta.json (slug = kebab of the title). Make it reusable for future projects. Skip one-off or too-specific inspirations.
- (c) UPDATE — when you reuse a reference on a new project, add the project name to usedIn[] in its meta.json.
- (d) SKIP — do not save disposable or overly project-specific inspirations that will never transfer to another project.`;
