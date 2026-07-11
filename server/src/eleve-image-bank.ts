// Banque d'images LOCALES (L123) — garantir de VRAIES images même avec un Élève faible.
//
// Constat (galerie Qwythos-9B, 2026-07-10) : un cerveau LOCAL modeste DÉSOBÉIT — il
// invente des URLs (id Pexels halluciné → 404) ou des chemins locaux inexistants
// (/images/x.jpg sans fichier), malgré la consigne et l'outil chercher_image. Les
// gardes existants ne couvrent pas ce cas (eleve-gate = domaines placeholder connus ;
// eleve-image-check = URL Pexels au BON id ; render-integrity = signale, ne corrige pas).
//
// Réponse (deux temps, déterministe, fail-open, souverain) :
//   AMONT  curateImageBank → télécharge de vraies photos Pexels dans public/images/ et
//          les injecte dans le prompt (« utilise EXACTEMENT ces chemins »).
//   AVAL   guaranteeLocalImages → à la clôture, toute image cassée/inventée (URL morte
//          OU chemin local absent) est REMPLACÉE par une image de la banque. On ne fait
//          plus confiance à l'obéissance de l'ouvrier : on GARANTIT le livrable.
//
// Sans clé Pexels ou réseau coupé → banque vide → comportement inchangé (0 régression).
import fs from "node:fs";
import path from "node:path";
import { searchPexelsImages, pexelsConfigured } from "./taste/taste-images.js";
import { extractImageUrls, probe, replaceInFiles, listSourceFiles } from "./eleve-image-check.js";

export interface ImageBankEntry {
  /** Chemin PUBLIC référençable dans le code (ex. "/images/img-01.jpg"). */
  localPath: string;
  /** Description Pexels (alt) — sert au log et à la pertinence du remplacement. */
  alt: string;
  /** Requête Pexels qui a produit l'image. */
  query: string;
}

export interface ImageBankDeps {
  fetchImpl?: typeof fetch;
  pexelsKey?: string;
}

export interface GuaranteeReport {
  replaced: Array<{ from: string; to: string }>;
  stillBroken: string[];
}

/** Combien d'images on vise dans la banque (assez pour couvrir un livrable, sans gonfler le repo). */
const BANK_TARGET = 8;

/** Mots vides FR+EN + verbiage de brief à ignorer pour dériver des requêtes Pexels. */
const STOP = new Set([
  "avec", "sans", "pour", "dans", "chaque", "leur", "leurs", "elle", "cette", "cettes", "votre", "notre",
  "être", "faire", "plus", "moins", "très", "tout", "tous", "toute", "toutes", "puis", "aussi", "donc",
  "site", "page", "pages", "application", "app", "crée", "créer", "réalise", "fais", "build", "with", "that",
  "this", "these", "your", "have", "from", "into", "them", "then", "also", "make", "creates", "create",
  "website", "using", "must", "should", "props", "state", "react", "vite", "tailwind", "component", "components",
]);

/** Dérive 1 à 3 requêtes Pexels (mots-clés significatifs du brief). Déterministe, sans LLM. */
export function deriveQueries(brief: string): string[] {
  const words = (brief.toLowerCase().match(/[a-zàâäéèêëïîôöùûüçñ0-9]{4,}/gi) ?? []).filter((w) => !STOP.has(w));
  const uniq = [...new Set(words)];
  if (uniq.length === 0) return [];
  const queries = [uniq.slice(0, 3).join(" "), uniq.slice(3, 6).join(" "), uniq.slice(6, 9).join(" ")];
  return queries.filter(Boolean);
}

/** Extension image depuis l'URL (avant la query), "jpg" par défaut (Pexels sert du jpeg). */
function extFromUrl(url: string): string {
  const m = /\.(jpe?g|png|webp|avif|gif)(?:\?|$)/i.exec(url);
  const raw = (m?.[1] ?? "jpg").toLowerCase();
  return raw === "jpeg" ? "jpg" : raw;
}

/** Télécharge une image vers `destAbsPath`. true si le fichier a été écrit. Ne lève jamais. */
export async function downloadImage(url: string, destAbsPath: string, deps?: ImageBankDeps): Promise<boolean> {
  const f = deps?.fetchImpl ?? fetch;
  try {
    const res = await f(url);
    if (!res.ok) return false;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0) return false;
    fs.writeFileSync(destAbsPath, buf);
    return true;
  } catch {
    return false;
  }
}

/**
 * Constat (galerie-qwythos-q6, 2026-07-11) : même informé du chemin EXACT
 * (`/images/img-01.jpg`), un cerveau faible construit parfois le nom de fichier
 * DYNAMIQUEMENT en JS (`` `/images/img-${item.id}.jpg` ``) — invisible à un scan
 * statique du code (extractLocalImageRefs ne voit que des littéraux). Plutôt que
 * de deviner tous les patterns JS possibles, on couvre les conventions numériques
 * les plus courantes en écrivant aussi des COPIES sous ces noms : quel que soit
 * le schéma halluciné (1-based non-paddé, 0-based), un fichier existe déjà.
 * Coût négligeable (copie locale, pas de re-téléchargement).
 */
function writeNamingAliases(imagesDir: string, canonicalFilename: string, oneBasedIndex: number, ext: string): void {
  const src = path.join(imagesDir, canonicalFilename);
  const aliases = [
    `img-${oneBasedIndex}.${ext}`, // 1-based non-paddé : img-1.jpg
    `img-${oneBasedIndex - 1}.${ext}`, // 0-based non-paddé : img-0.jpg
  ];
  for (const alias of aliases) {
    if (alias === canonicalFilename) continue;
    try {
      fs.copyFileSync(src, path.join(imagesDir, alias));
    } catch {
      /* un alias raté n'empêche pas les autres ni le canonique */
    }
  }
}

/**
 * Pré-cure une banque de vraies photos Pexels et les TÉLÉCHARGE dans public/images/ du
 * projet, puis écrit un manifeste .mango-image-bank.json. Retourne les entrées (chemins
 * locaux) — vide si pas de clé Pexels / réseau coupé / aucun résultat. Ne lève jamais.
 */
export async function curateImageBank(brief: string, projectDir: string, deps?: ImageBankDeps): Promise<ImageBankEntry[]> {
  if (!pexelsConfigured({ apiKey: deps?.pexelsKey })) return [];
  const queries = deriveQueries(brief);
  if (queries.length === 0) return [];

  const imagesDir = path.join(projectDir, "public", "images");
  try {
    fs.mkdirSync(imagesDir, { recursive: true });
  } catch {
    return [];
  }

  const bank: ImageBankEntry[] = [];
  const seen = new Set<string>();
  const perQuery = Math.max(2, Math.ceil(BANK_TARGET / queries.length) + 1);
  let n = 0;

  for (const q of queries) {
    if (bank.length >= BANK_TARGET) break;
    const results = await searchPexelsImages(q, perQuery, { apiKey: deps?.pexelsKey, fetchImpl: deps?.fetchImpl });
    for (const r of results) {
      if (bank.length >= BANK_TARGET) break;
      if (!r.url || seen.has(r.url)) continue;
      seen.add(r.url);
      const ext = extFromUrl(r.url);
      const filename = `img-${String(n + 1).padStart(2, "0")}.${ext}`;
      const ok = await downloadImage(r.url, path.join(imagesDir, filename), deps);
      if (!ok) continue;
      n++;
      writeNamingAliases(imagesDir, filename, n, ext);
      bank.push({ localPath: `/images/${filename}`, alt: r.alt || q, query: q });
    }
  }

  if (bank.length > 0) {
    try {
      fs.writeFileSync(path.join(projectDir, ".mango-image-bank.json"), JSON.stringify(bank, null, 2), "utf8");
    } catch {
      /* le manifeste est un confort, son échec ne casse pas la banque */
    }
  }
  return bank;
}

/** Charge la banque depuis le manifeste (si curateImageBank a déjà tourné). [] sinon. */
export function loadImageBank(projectDir: string): ImageBankEntry[] {
  try {
    const raw = fs.readFileSync(path.join(projectDir, ".mango-image-bank.json"), "utf8");
    const arr = JSON.parse(raw) as ImageBankEntry[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

/** Bloc BORNÉ injecté dans le prompt système : les vraies images déjà dispo. "" si banque vide. */
export function formatImageBankForPrompt(bank: ImageBankEntry[]): string {
  if (bank.length === 0) return "";
  const lines = bank.map((e) => `- ${e.localPath}  (${e.alt})`).join("\n");
  return (
    `\n\n═══ IMAGES DISPONIBLES (déjà téléchargées dans public/images/) ═══\n` +
    `${bank.length} vraies photos sont DÉJÀ dans le projet. Pour illustrer, référence EXACTEMENT un de ces chemins locaux :\n` +
    `${lines}\n` +
    `RÈGLE ABSOLUE : n'invente JAMAIS une URL ni un chemin d'image. Utilise UNIQUEMENT les chemins ci-dessus ` +
    `(ou l'outil chercher_image si aucun ne convient). Un chemin/URL inventé = image cassée à l'écran.\n`
  );
}

/** Chemins d'image LOCAUX (public) référencés dans le code : "/images/x.jpg" → fichiers porteurs.
 * La lookbehind exclut les chemins internes d'une URL http (précédés d'un mot / ':' / '/'). */
const LOCAL_IMG_RE = /(?<![\w.:/])(\/[A-Za-z0-9._/-]*?\.(?:jpe?g|png|webp|avif|gif))/gi;

export function extractLocalImageRefs(projectDir: string): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const file of listSourceFiles(projectDir)) {
    let text: string;
    try {
      text = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const m of text.matchAll(LOCAL_IMG_RE)) {
      const ref = m[1];
      if (!map.has(ref)) map.set(ref, []);
      const arr = map.get(ref)!;
      if (!arr.includes(file)) arr.push(file);
    }
  }
  return map;
}

/**
 * Filet de DERNIER RECOURS : à la clôture (build vert), toute image cassée est remplacée
 * par une image de la banque locale. Deux familles de casse détectées :
 *   (a) URL http MORTE (404/410) — réutilise probe (indéterminé/réseau → non touché) ;
 *   (b) chemin local /…jpg dont le fichier est ABSENT de public/.
 * Remplacement round-robin sur la banque (déterministe). Si la banque est vide, on ne
 * remplace rien et on remonte `stillBroken` (l'appelant garde le nudge Élève). Ne lève jamais.
 */
export async function guaranteeLocalImages(projectDir: string, bank: ImageBankEntry[], deps?: ImageBankDeps): Promise<GuaranteeReport> {
  const f = deps?.fetchImpl ?? fetch;
  const report: GuaranteeReport = { replaced: [], stillBroken: [] };
  const broken = new Map<string, string[]>();

  // (a) URLs http mortes
  for (const [url, files] of extractImageUrls(projectDir)) {
    const alive = await probe(url, f);
    if (alive === false) broken.set(url, files);
  }
  // (b) chemins locaux dont le fichier n'existe pas dans public/
  for (const [ref, files] of extractLocalImageRefs(projectDir)) {
    const abs = path.join(projectDir, "public", ref.replace(/^\//, ""));
    if (!fs.existsSync(abs)) broken.set(ref, files);
  }

  if (broken.size === 0) return report;
  if (bank.length === 0) {
    report.stillBroken = [...broken.keys()];
    return report;
  }

  let i = 0;
  for (const [ref, files] of broken) {
    const entry = bank[i % bank.length];
    i++;
    replaceInFiles(files, ref, entry.localPath);
    report.replaced.push({ from: ref, to: entry.localPath });
  }
  return report;
}

/** Ligne de log lisible du filet (ou "" si rien à signaler). */
export function formatGuarantee(r: GuaranteeReport): string {
  if (r.replaced.length === 0 && r.stillBroken.length === 0) return "";
  const parts: string[] = [];
  if (r.replaced.length) parts.push(`🖼 ${r.replaced.length} image(s) cassée(s) remplacée(s) par la banque locale`);
  if (r.stillBroken.length) parts.push(`${r.stillBroken.length} cassée(s) sans banque dispo`);
  return parts.join(" · ");
}
