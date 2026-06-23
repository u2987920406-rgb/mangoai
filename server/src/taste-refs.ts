// Ingestion du dossier taste-references/ — la matière que Raf dépose (#149 Moteur de Goût).
// Pure I/O (fs only), zéro réseau → testable avec un dossier temporaire.
//
// Deux formes acceptées, sans rigidité :
//  - sous-dossier AVEC refs.json → une DIRECTION (ou un pack), { urls, images, notes }
//  - sous-dossier SANS refs.json → une source LIBRE (ex. "Git ref/", "url_Raf/") :
//    on en extrait les URLs des fichiers .txt + les images présentes.

import fs from "node:fs";
import path from "node:path";

export const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);

export interface DirectionRefs {
  id: string;
  name: string;
  kind: string; // "direction" (style esthétique) | "domain" (références d'un TYPE de projet, ex. restaurant)
  urls: string[];
  images: string[]; // chemins ABSOLUS, existants
  notes: string;
  fromCatalog: boolean; // possède un refs.json
}

export interface LooseFile {
  name: string;
  urls: string[];
  otherTextLines: number; // lignes de texte non-URL (ex. brief resto = noms à rechercher)
}

export interface LooseSource {
  folder: string;
  files: LooseFile[];
  images: string[]; // chemins absolus
}

export interface TasteReferences {
  root: string;
  directions: DirectionRefs[];
  loose: LooseSource[];
}

const URL_RE = /https?:\/\/[^\s"'<>)]+/g;

/** Extrait les URLs http(s) d'un texte (dédupliquées, ponctuation finale élaguée). */
export function extractUrls(textContent: string): string[] {
  const out = new Set<string>();
  for (const m of textContent.matchAll(URL_RE)) out.add(m[0].replace(/[.,;]+$/, ""));
  return [...out];
}

function listImages(dir: string): string[] {
  try {
    return fs
      .readdirSync(dir)
      .filter((f) => IMAGE_EXTS.has(path.extname(f).toLowerCase()))
      .map((f) => path.join(dir, f))
      .sort();
  } catch {
    return [];
  }
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

/** Lit l'ensemble du dossier de références en une structure exploitable par le moteur. */
export function loadTasteReferences(root: string): TasteReferences {
  const directions: DirectionRefs[] = [];
  const loose: LooseSource[] = [];
  if (!fs.existsSync(root)) return { root, directions, loose };

  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(root, entry.name);
    const refsPath = path.join(dir, "refs.json");

    if (fs.existsSync(refsPath)) {
      let parsed: Record<string, unknown> = {};
      try {
        parsed = JSON.parse(fs.readFileSync(refsPath, "utf8")) as Record<string, unknown>;
      } catch {
        parsed = {};
      }
      const declared = asStringArray(parsed["images"]);
      const imgSet = new Set<string>(listImages(dir));
      for (const im of declared) imgSet.add(path.isAbsolute(im) ? im : path.join(dir, im));
      directions.push({
        id: typeof parsed["direction"] === "string" ? (parsed["direction"] as string) : entry.name,
        name: typeof parsed["name"] === "string" ? (parsed["name"] as string) : entry.name,
        kind: typeof parsed["kind"] === "string" ? (parsed["kind"] as string) : "direction",
        urls: asStringArray(parsed["urls"]),
        images: [...imgSet].filter((p) => fs.existsSync(p)),
        notes: typeof parsed["notes"] === "string" ? (parsed["notes"] as string) : "",
        fromCatalog: true,
      });
    } else {
      const files: LooseFile[] = [];
      for (const f of fs.readdirSync(dir)) {
        if (path.extname(f).toLowerCase() !== ".txt") continue;
        const content = fs.readFileSync(path.join(dir, f), "utf8");
        const urls = extractUrls(content);
        const otherTextLines = content.split(/\r?\n/).filter((l) => l.trim() && !/https?:\/\//.test(l)).length;
        files.push({ name: f, urls, otherTextLines });
      }
      loose.push({ folder: entry.name, files, images: listImages(dir) });
    }
  }
  return { root, directions, loose };
}

/** Toutes les URLs (directions + sources libres), dédupliquées. */
export function allUrls(refs: TasteReferences): string[] {
  const s = new Set<string>();
  for (const d of refs.directions) d.urls.forEach((u) => s.add(u));
  for (const l of refs.loose) for (const f of l.files) f.urls.forEach((u) => s.add(u));
  return [...s];
}

/** Sources libres qui ont du texte mais AUCUNE URL (ex. brief resto à rechercher sur le web). */
export function pendingBriefs(refs: TasteReferences): { folder: string; file: string; lines: number }[] {
  const out: { folder: string; file: string; lines: number }[] = [];
  for (const l of refs.loose)
    for (const f of l.files) if (f.urls.length === 0 && f.otherTextLines > 0) out.push({ folder: l.folder, file: f.name, lines: f.otherTextLines });
  return out;
}
