// Outil DOCUMENT de l'Élève agentique (#157) — « pars de la VRAIE source du user ».
//
// Transmission de compétence (directive permanente de Raf, cf. transmission-
// competences) : quand l'utilisateur fournit un document (cahier des charges, énoncé,
// spec, PDF de référence), l'Élève GLM construit souvent depuis une description vague
// au lieu de LIRE la source réelle → il invente des détails qui s'écartent du besoin.
// On lui donne le réflexe de Claude : OUVRIR le document et partir de son contenu.
//
// Réutilise la primitive PDF de #147 (`extractPdfText`, pdfjs-dist legacy, extraction
// de texte page par page) + le confinement de chemin de l'Élève (resolveInside). Les
// fichiers déposés par l'utilisateur arrivent dans <projet>/.assets/ (uploads.ts).
// Projet-scopé, ne lève jamais (isError pédagogique). Formats : PDF + textes courants.

import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { KernelTool, KernelToolResult } from "./kernel-mcp.js";
import { extractPdfText } from "./pdf-pipeline.js";
import { confinePath } from "./perimeter-context.js";

/** Un document est une SOURCE de travail → plafond plus large que read_file (24k). */
const MAX_DOC_CHARS = 40_000;
const PDF_EXT = ".pdf";
const DOCX_EXT = ".docx";
/** Formats Office binaires extraits via officeparser (ZIP+XML → texte). */
const OFFICE_EXTS = new Set([".xlsx", ".pptx"]);
/** Extensions lues comme du texte brut (UTF-8). */
const TEXT_EXTS = new Set([
  ".txt", ".md", ".markdown", ".csv", ".tsv", ".json", ".html", ".htm", ".xml", ".yaml", ".yml", ".log", ".rst",
]);

/** Étiquette lisible d'un format Office (pour les messages à l'Élève). */
function officeLabel(ext: string): string {
  if (ext === DOCX_EXT) return "Word .docx";
  if (ext === ".xlsx") return "Excel .xlsx";
  if (ext === ".pptx") return "PowerPoint .pptx";
  return ext;
}

/** Confinement de chemin au projet (calqué sur eleve-tools/executor.resolveInside).
 * (#180 É2) Lecture de document → accès `read`. Gate OFF = byte-identique. */
function resolveInside(root: string, rel: string): string {
  return confinePath(root, rel, "read");
}

/** Tronque proprement avec un indice pour aller chercher la suite. */
function clip(text: string): string {
  return text.length > MAX_DOC_CHARS
    ? text.slice(0, MAX_DOC_CHARS) +
        `\n… [tronqué — ${text.length} caractères au total ; précise une page (PDF) ou cherche une section pour lire la suite]`
    : text;
}

/** Dépendances injectables (tests sans pdfjs/mammoth/officeparser réels). */
export interface DocumentDeps {
  /** PDF → texte page par page (primitive #147). */
  extractPdf: (pdfPath: string) => Promise<Array<{ text: string; pageNum: number }>>;
  /** .docx → texte brut (mammoth, le meilleur extracteur Word). */
  extractDocx: (docxPath: string) => Promise<string>;
  /** .xlsx/.pptx → texte brut (officeparser, AST → toText). */
  extractOffice: (officePath: string) => Promise<string>;
}

const realDeps: DocumentDeps = {
  extractPdf: extractPdfText,
  // Chargés DYNAMIQUEMENT (comme pdfjs dans #147) : zéro coût pour les tests, et la
  // dépendance n'est tirée que si un tel document est réellement lu. Tout en local ($0).
  extractDocx: async (p) => {
    const mammoth = await import("mammoth");
    const { value } = await mammoth.extractRawText({ path: p });
    return value;
  },
  extractOffice: async (p) => {
    const { parseOffice } = await import("officeparser");
    const ast = await parseOffice(p);
    return ast.toText();
  },
};

/** Extrait le texte d'un document Office binaire (docx/xlsx/pptx) : enrobe l'appel
 * (qui peut lever) en isError gracieux + plafond + détection de vide. `rel` = chemin
 * relatif (messages), `label` = nom lisible du format. */
async function readOfficeDoc(
  rel: string,
  label: string,
  extract: () => Promise<string>,
): Promise<KernelToolResult> {
  let text: string;
  try {
    text = await extract();
  } catch (e) {
    return { text: `Lecture du document ${label} impossible (${rel}) : ${e instanceof Error ? e.message : String(e)}`, isError: true };
  }
  if (!text || !text.trim()) {
    return { text: `${rel} (${label}) : aucun texte extractible (document vide, ou uniquement des images ?).`, isError: true };
  }
  return { text: `${rel} (${label}) :\n\n${clip(text)}` };
}

/**
 * Outil `lire_document(chemin, page?)` : lit un document du projet et renvoie son
 * TEXTE. PDF → extraction texte page par page (réutilise #147) ; .docx → mammoth ;
 * .xlsx/.pptx → officeparser ; .txt/.md/.csv/.json/.html… → lecture UTF-8. Confiné
 * au projet, ne lève jamais.
 */
export function buildEleveDocumentTools(projectDir: string, deps: DocumentDeps = realDeps): KernelTool[] {
  const root = path.resolve(projectDir);

  const lireDocument: KernelTool = {
    name: "lire_document",
    description:
      "Lit un document fourni par l'utilisateur (PDF, Word .docx, Excel .xlsx, PowerPoint .pptx, ou texte .txt/.md/.csv/.json/.html…) et renvoie son TEXTE — pour que tu partes de la VRAIE source du besoin au lieu d'inventer. Chemin relatif au projet ; les fichiers déposés par l'utilisateur sont dans .assets/ (ex. .assets/cahier-des-charges.docx). Pour un PDF, le texte est extrait page par page (donne `page` pour n'en lire qu'une).",
    inputSchema: {
      chemin: z.string().describe("Chemin relatif au document, ex. .assets/spec.pdf ou docs/notes.md"),
      page: z.number().int().min(1).optional().describe("PDF uniquement : ne lire QUE cette page (1-based)."),
    },
    handler: async (args): Promise<KernelToolResult> => {
      const rel = String(args.chemin ?? "").trim();
      if (!rel) {
        return { text: "Donne le chemin du document à lire (ex. .assets/cahier-des-charges.pdf).", isError: true };
      }

      let abs: string;
      try {
        abs = resolveInside(root, rel);
      } catch (e) {
        return { text: (e as Error).message, isError: true };
      }
      if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
        return {
          text: `Document introuvable : ${rel}. Les fichiers déposés par l'utilisateur sont dans .assets/ — vérifie le nom exact (list_files).`,
          isError: true,
        };
      }

      const ext = path.extname(abs).toLowerCase();

      // ── PDF : extraction de texte (primitive #147) ──────────────────────────
      if (ext === PDF_EXT) {
        let pages: Array<{ text: string; pageNum: number }>;
        try {
          pages = await deps.extractPdf(abs);
        } catch (e) {
          return {
            text: `Lecture du PDF impossible (${rel}) : ${e instanceof Error ? e.message : String(e)}`,
            isError: true,
          };
        }
        if (pages.length === 0) {
          return { text: `Le PDF ${rel} ne contient aucune page lisible.`, isError: true };
        }

        const wanted = typeof args.page === "number" ? Math.floor(args.page) : null;
        if (wanted != null) {
          const p = pages.find((x) => x.pageNum === wanted);
          if (!p) {
            return { text: `Page ${wanted} hors limites — le PDF ${rel} a ${pages.length} page(s).`, isError: true };
          }
          const body = p.text.trim();
          if (!body) {
            return { text: `Page ${wanted} de ${rel} : aucun texte extractible (page scannée/image ?).` };
          }
          return { text: `${rel} — page ${wanted}/${pages.length} :\n\n${clip(body)}` };
        }

        if (pages.every((p) => !p.text.trim())) {
          return {
            text: `${rel} : ${pages.length} page(s) mais AUCUN texte extractible (PDF scanné/image ?). Si tu dois en lire le contenu visuel, un rendu image serait nécessaire.`,
            isError: true,
          };
        }
        const joined = pages.map((p) => `── page ${p.pageNum} ──\n${p.text.trim()}`).join("\n\n");
        return { text: `${rel} — ${pages.length} page(s), texte extrait :\n\n${clip(joined)}` };
      }

      // ── Word .docx (mammoth) ────────────────────────────────────────────────
      if (ext === DOCX_EXT) {
        return readOfficeDoc(rel, officeLabel(ext), () => deps.extractDocx(abs));
      }

      // ── Excel .xlsx / PowerPoint .pptx (officeparser) ───────────────────────
      if (OFFICE_EXTS.has(ext)) {
        return readOfficeDoc(rel, officeLabel(ext), () => deps.extractOffice(abs));
      }

      // ── Texte brut ──────────────────────────────────────────────────────────
      if (TEXT_EXTS.has(ext)) {
        let content: string;
        try {
          content = fs.readFileSync(abs, "utf8");
        } catch {
          return { text: `Document illisible (binaire ?) : ${rel}.`, isError: true };
        }
        if (!content.trim()) {
          return { text: `${rel} est vide.` };
        }
        return { text: `${rel} :\n\n${clip(content)}` };
      }

      // ── Format non supporté ─────────────────────────────────────────────────
      return {
        text: `Type de document non supporté : ${ext || "(sans extension)"}. Formats lisibles : PDF, Word .docx, Excel .xlsx, PowerPoint .pptx, et textes (.txt, .md, .csv, .json, .html, .xml, .yaml). Pour un ancien .doc/.xls/.ppt (format binaire hérité), demande à l'utilisateur un export récent (.docx/.xlsx/.pptx) ou PDF.`,
        isError: true,
      };
    },
  };

  return [lireDocument];
}
