// Outil ARCHIVE de l'Élève (2026-06-27) — « lis DANS une archive ».
//
// Transmission de compétence (directive permanente de Raf, cf. transmission-
// competences) : comme `lire_document` #157 a appris à Mango à lire PDF/Word/Excel,
// `lire_archive` lui apprend à lire DANS un .zip/.rar — LISTER le contenu, puis LIRE
// un fichier interne (texte). Né d'un cas réel : en Discuter, GLM disait « je ne peux
// pas extraire d'archives » → désormais il le peut (lecture).
//
// READ-ONLY (n'écrit RIEN sur le disque → utilisable en Discuter comme en Construire),
// projet-scopé (resolveInside), ne lève JAMAIS (isError pédagogique). zip via `fflate`
// (pur JS, $0), rar via `node-unrar-js` (WASM, $0), chargés DYNAMIQUEMENT (zéro coût au
// boot, zéro réseau). Gate `ELEVE_ARCHIVE`.

import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { KernelTool, KernelToolResult } from "./kernel-mcp.js";

/** Une archive est une SOURCE → même plafond de lecture que lire_document. */
const MAX_FILE_CHARS = 40_000;
/** Liste bornée (une archive peut contenir des milliers d'entrées). */
const MAX_ENTRIES = 300;
/** Refus si l'archive dépasse (garde-fou mémoire / zip-bomb basique). */
const MAX_ARCHIVE_BYTES = 80_000_000;
const ZIP_EXT = ".zip";
const RAR_EXT = ".rar";

export interface ArchiveEntry { name: string; size: number; dir: boolean }

/** Confinement de chemin au projet (calqué sur eleve-document-tools/executor). */
function resolveInside(root: string, rel: string): string {
  const abs = path.resolve(root, rel);
  if (abs !== root && !abs.startsWith(root + path.sep)) {
    throw new Error(`chemin hors du projet : ${rel}`);
  }
  return abs;
}

/** ArrayBuffer propre depuis un Buffer Node (copie isolée → jamais un SharedArrayBuffer,
 *  et indépendant de la pool d'allocation de Node). */
function toArrayBuffer(buf: Buffer): ArrayBuffer {
  const copy = new Uint8Array(buf.byteLength);
  copy.set(buf);
  return copy.buffer;
}

/** Décodage UTF-8 tolérant + détection binaire simple (octet NUL dans l'échantillon). */
function decodeEntry(data: Uint8Array): { text: string; binary: boolean } {
  const binary = data.subarray(0, 8_000).includes(0);
  const text = new TextDecoder("utf-8", { fatal: false }).decode(data);
  return { text, binary };
}

function clip(text: string): string {
  return text.length > MAX_FILE_CHARS
    ? text.slice(0, MAX_FILE_CHARS) + `\n… [tronqué — ${text.length} caractères au total]`
    : text;
}

/** Dépendances injectables (tests sans fflate/node-unrar-js réels). */
export interface ArchiveDeps {
  listZip: (buf: Buffer) => Promise<ArchiveEntry[]>;
  readZip: (buf: Buffer, name: string) => Promise<Uint8Array | undefined>;
  listRar: (buf: Buffer) => Promise<ArchiveEntry[]>;
  readRar: (buf: Buffer, name: string) => Promise<Uint8Array | undefined>;
}

const realDeps: ArchiveDeps = {
  // zip : `filter` de fflate utilisé comme ITÉRATEUR — on collecte les noms SANS
  // décompresser (return false), donc lister une grosse archive reste bon marché.
  async listZip(buf) {
    const { unzipSync } = await import("fflate");
    const entries: ArchiveEntry[] = [];
    unzipSync(buf, {
      filter: (f) => {
        entries.push({ name: f.name, size: f.originalSize, dir: f.name.endsWith("/") });
        return false;
      },
    });
    return entries;
  },
  async readZip(buf, name) {
    const { unzipSync } = await import("fflate");
    const out = unzipSync(buf, { filter: (f) => f.name === name }); // décompresse CE fichier seul
    return out[name];
  },
  async listRar(buf) {
    const { createExtractorFromData } = await import("node-unrar-js");
    const extractor = await createExtractorFromData({ data: toArrayBuffer(buf) });
    const entries: ArchiveEntry[] = [];
    for (const h of extractor.getFileList().fileHeaders) {
      entries.push({ name: h.name, size: h.unpSize, dir: h.flags.directory });
    }
    return entries;
  },
  async readRar(buf, name) {
    const { createExtractorFromData } = await import("node-unrar-js");
    const extractor = await createExtractorFromData({ data: toArrayBuffer(buf) });
    for (const f of extractor.extract({ files: [name] }).files) {
      if (f.fileHeader.name === name && f.extraction) return f.extraction;
    }
    return undefined;
  },
};

/** Rend la liste des entrées en texte lisible (bornée). */
function formatList(rel: string, label: string, entries: ArchiveEntry[]): KernelToolResult {
  const files = entries.filter((e) => !e.dir);
  if (files.length === 0) {
    return { text: `${rel} (${label}) : archive vide (aucun fichier).` };
  }
  const shown = files.slice(0, MAX_ENTRIES);
  const lines = shown.map((e) => `  • ${e.name}${e.size ? `  (${e.size} o)` : ""}`).join("\n");
  const more = files.length > MAX_ENTRIES ? `\n… et ${files.length - MAX_ENTRIES} autre(s) — affine si besoin.` : "";
  return {
    text: `${rel} (${label}) — ${files.length} fichier(s) :\n${lines}${more}\n\nPour lire l'un d'eux, rappelle lire_archive avec \`fichier\` = le chemin interne exact.`,
  };
}

/**
 * Outil `lire_archive(chemin, fichier?)` : SANS `fichier` → liste le contenu de
 * l'archive (.zip/.rar) ; AVEC `fichier` → lit ce fichier interne (texte) et renvoie
 * son contenu. Lecture seule, confiné au projet, ne lève jamais.
 */
export function buildEleveArchiveTools(projectDir: string, deps: ArchiveDeps = realDeps): KernelTool[] {
  const root = path.resolve(projectDir);

  const lireArchive: KernelTool = {
    name: "lire_archive",
    description:
      "Lit DANS une archive .zip ou .rar fournie par l'utilisateur (lecture seule, n'extrait rien sur le disque). " +
      "SANS `fichier` : liste le contenu de l'archive (les chemins internes). AVEC `fichier` : renvoie le TEXTE de ce fichier interne. " +
      "Chemin relatif au projet ; les fichiers déposés par l'utilisateur sont dans .assets/ (ex. .assets/projet.zip). " +
      "Pour lire un PDF/Word/Excel CONTENU dans l'archive, extrais-le d'abord (mode Construire) puis lire_document.",
    inputSchema: {
      chemin: z.string().describe("Chemin relatif à l'archive, ex. .assets/livrables.zip ou docs/sources.rar"),
      fichier: z.string().optional().describe("Chemin INTERNE à lire (ex. src/index.js). Omis → liste le contenu."),
    },
    handler: async (args): Promise<KernelToolResult> => {
      const rel = String(args.chemin ?? "").trim();
      if (!rel) {
        return { text: "Donne le chemin de l'archive à lire (ex. .assets/projet.zip).", isError: true };
      }

      let abs: string;
      try {
        abs = resolveInside(root, rel);
      } catch (e) {
        return { text: (e as Error).message, isError: true };
      }
      if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
        return { text: `Archive introuvable : ${rel}. Les fichiers déposés sont dans .assets/ — vérifie le nom (list_files).`, isError: true };
      }

      const ext = path.extname(abs).toLowerCase();
      if (ext !== ZIP_EXT && ext !== RAR_EXT) {
        return { text: `Type non supporté : ${ext || "(sans extension)"}. lire_archive lit .zip et .rar uniquement. Pour un PDF/Word/Excel direct, utilise lire_document.`, isError: true };
      }

      const size = fs.statSync(abs).size;
      if (size > MAX_ARCHIVE_BYTES) {
        return { text: `Archive trop volumineuse (${size} o > ${MAX_ARCHIVE_BYTES}). Demande à l'utilisateur un sous-ensemble.`, isError: true };
      }

      let buf: Buffer;
      try {
        buf = fs.readFileSync(abs);
      } catch (e) {
        return { text: `Lecture de l'archive impossible (${rel}) : ${e instanceof Error ? e.message : String(e)}`, isError: true };
      }

      const isRar = ext === RAR_EXT;
      const label = isRar ? "RAR" : "ZIP";

      // ── Lister le contenu ─────────────────────────────────────────────────────
      const wanted = String(args.fichier ?? "").trim();
      if (!wanted) {
        let entries: ArchiveEntry[];
        try {
          entries = isRar ? await deps.listRar(buf) : await deps.listZip(buf);
        } catch (e) {
          return { text: `Archive ${label} illisible (${rel}) : ${e instanceof Error ? e.message : String(e)}. Corrompue ou chiffrée ?`, isError: true };
        }
        return formatList(rel, label, entries);
      }

      // ── Lire un fichier interne ───────────────────────────────────────────────
      let data: Uint8Array | undefined;
      try {
        data = isRar ? await deps.readRar(buf, wanted) : await deps.readZip(buf, wanted);
      } catch (e) {
        return { text: `Extraction de « ${wanted} » impossible (${rel}) : ${e instanceof Error ? e.message : String(e)}.`, isError: true };
      }
      if (!data) {
        return { text: `Fichier interne introuvable : « ${wanted} » n'est pas dans ${rel}. Liste d'abord l'archive (lire_archive sans \`fichier\`).`, isError: true };
      }

      const { text, binary } = decodeEntry(data);
      if (binary || !text.trim()) {
        return { text: `« ${wanted} » (${data.length} o) semble BINAIRE (image, exécutable, sous-archive…) — pas du texte lisible. Si c'est un PDF/Word/Excel, extrais-le (mode Construire) puis lire_document.`, isError: true };
      }
      return { text: `${rel} › ${wanted} :\n\n${clip(text)}` };
    },
  };

  return [lireArchive];
}
