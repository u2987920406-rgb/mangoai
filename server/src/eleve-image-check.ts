// Vérification & réparation des images du livrable (compétence MANAGER de Mango).
//
// Constat (5 gros projets, 2026-06-26) : l'Élève GLM a le BON id de photo Pexels
// mais RECONSTRUIT parfois l'URL de mémoire — slug inventé ≠ slug réel → le CDN sert
// par chemin EXACT → 404 (1 cuvée de maison-terroir cassée). On ne corrige pas le
// cerveau (poids figés, il re-mal-transcrira) : on apprend à MANGO à faire le contrôle
// qualité du livrable. Le manager ne fait jamais confiance aveuglément à la copie de
// son ouvrier — il VÉRIFIE chaque image rendue, et la RÉPARE quand il peut (l'id est
// presque toujours bon → on re-dérive l'URL canonique via l'API Pexels), sinon il
// renvoie l'ouvrier corriger. Déterministe, best-effort, ne lève jamais.
import fs from "node:fs";
import path from "node:path";

/** Fichiers texte où une URL d'image peut apparaître (code + styles). */
const SCANNED_EXT = new Set([".jsx", ".tsx", ".js", ".ts", ".css", ".html", ".json", ".md"]);
/** URL http(s) d'image (extension image, query optionnelle). */
const IMG_URL_RE = /https?:\/\/[^"'`)\s]+?\.(?:jpe?g|png|webp|avif|gif)(?:\?[^"'`)\s]*)?/gi;

export interface ImageCheckDeps {
  fetchImpl?: typeof fetch;
  pexelsKey?: string;
}

export interface ImageCheckReport {
  checked: number;
  dead: string[];
  repaired: Array<{ from: string; to: string }>;
  unrepairable: string[];
}

/** Parcourt récursivement `dir` (borné à src/, public/ et racine du projet) en
 * renvoyant les chemins de fichiers texte scannables. Ignore node_modules/dist/.git. */
function listSourceFiles(dir: string, depth = 0): string[] {
  if (depth > 6) return [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const e of entries) {
    if (e.name.startsWith(".") || e.name === "node_modules" || e.name === "dist" || e.name === "build") continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listSourceFiles(full, depth + 1));
    else if (SCANNED_EXT.has(path.extname(e.name).toLowerCase())) out.push(full);
  }
  return out;
}

/** Toutes les URLs d'image externes du projet → liste des fichiers qui les portent.
 * `url` normalisée telle qu'écrite (on remplace la chaîne EXACTE plus tard). */
export function extractImageUrls(projectDir: string): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const file of listSourceFiles(projectDir)) {
    let text: string;
    try {
      text = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    const found = text.match(IMG_URL_RE);
    if (!found) continue;
    for (const raw of found) {
      const url = raw.replace(/\\u0026/g, "&"); // au cas où échappé dans du JSON
      if (!map.has(url)) map.set(url, []);
      const arr = map.get(url)!;
      if (!arr.includes(file)) arr.push(file);
    }
  }
  return map;
}

/** L'id de photo d'une URL Pexels (`…/photos/<id>/…`), ou null. */
export function pexelsIdOf(url: string): string | null {
  const m = /images\.pexels\.com\/photos\/(\d+)\//.exec(url);
  return m ? m[1] : null;
}

/** Statut d'une URL : true = vivante, false = MORTE (404/410 confirmé), null =
 * indéterminé (réseau coupé, timeout, 5xx…) → on ne flag PAS (pas de faux positif). */
async function probe(url: string, f: typeof fetch): Promise<boolean | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    let res = await f(url, { method: "HEAD", signal: ctrl.signal });
    // Certains CDN refusent HEAD (405/501) → on retente en GET (sans lire le corps).
    if (res.status === 405 || res.status === 501) {
      res = await f(url, { method: "GET", signal: ctrl.signal });
      try {
        await res.body?.cancel();
      } catch {
        /* rien */
      }
    }
    if (res.status === 404 || res.status === 410) return false;
    if (res.ok || (res.status >= 300 && res.status < 400)) return true;
    return null; // 403/5xx/autre → indéterminé, on ne touche pas
  } catch {
    return null; // réseau/timeout → indéterminé
  } finally {
    clearTimeout(t);
  }
}

/** URL canonique (vivante) d'une photo Pexels depuis son id, via l'API. null si KO. */
async function canonicalPexelsUrl(id: string, key: string, f: typeof fetch): Promise<string | null> {
  try {
    const res = await f(`https://api.pexels.com/v1/photos/${id}`, { headers: { Authorization: key } });
    if (!res.ok) return null;
    const data = (await res.json()) as { src?: { large2x?: string; large?: string; original?: string } };
    return data.src?.large2x ?? data.src?.large ?? data.src?.original ?? null;
  } catch {
    return null;
  }
}

/** Remplace la chaîne EXACTE `from` par `to` dans les fichiers donnés. */
function replaceInFiles(files: string[], from: string, to: string): void {
  for (const file of files) {
    try {
      const text = fs.readFileSync(file, "utf8");
      if (text.includes(from)) fs.writeFileSync(file, text.split(from).join(to), "utf8");
    } catch {
      /* un fichier illisible ne casse pas la réparation des autres */
    }
  }
}

/**
 * Contrôle qualité des images du livrable : sonde chaque URL d'image externe ; pour
 * une MORTE issue de Pexels, re-dérive l'URL canonique depuis l'id et la remplace
 * dans le code (réparation déterministe — le manager corrige la coquille). Les mortes
 * non réparables (id absent, photo réellement supprimée) sont remontées pour renvoyer
 * l'ouvrier. Ne lève jamais ; sans clé Pexels, détecte mais ne répare pas les Pexels.
 */
export async function checkAndRepairImages(projectDir: string, deps?: ImageCheckDeps): Promise<ImageCheckReport> {
  const f = deps?.fetchImpl ?? fetch;
  const key = deps?.pexelsKey ?? process.env["PEXELS_API_KEY"] ?? "";
  const urls = extractImageUrls(projectDir);
  const report: ImageCheckReport = { checked: urls.size, dead: [], repaired: [], unrepairable: [] };

  for (const [url, files] of urls) {
    const alive = await probe(url, f);
    if (alive !== false) continue; // vivante ou indéterminée → on ne touche pas
    report.dead.push(url);

    const id = pexelsIdOf(url);
    const canonical = id && key ? await canonicalPexelsUrl(id, key, f) : null;
    if (canonical && canonical !== url) {
      const ok = await probe(canonical, f);
      if (ok !== false) {
        replaceInFiles(files, url, canonical);
        report.repaired.push({ from: url, to: canonical });
        continue;
      }
    }
    report.unrepairable.push(url);
  }
  return report;
}

/** Ligne de log lisible du contrôle (ou "" si rien à signaler). */
export function formatImageCheck(r: ImageCheckReport): string {
  if (r.dead.length === 0) return "";
  const parts = [`🖼 Contrôle images : ${r.dead.length} morte(s) sur ${r.checked}`];
  if (r.repaired.length) parts.push(`${r.repaired.length} réparée(s) (URL canonique re-dérivée de l'id Pexels)`);
  if (r.unrepairable.length) parts.push(`${r.unrepairable.length} non réparable(s)`);
  return parts.join(" · ");
}

/** Nudge envoyé à l'ouvrier pour les images non réparables (renvoi ciblé). "" si aucune. */
export function buildImageRepairNudge(r: ImageCheckReport): string {
  if (r.unrepairable.length === 0) return "";
  return (
    `⚠ ${r.unrepairable.length} image(s) renvoient une erreur 404 (introuvables) :\n` +
    r.unrepairable.map((u) => `- ${u}`).join("\n") +
    "\n→ Remplace CHACUNE par une vraie photo via l'outil chercher_image, en COPIANT l'URL EXACTE qu'il te renvoie " +
    "(ne reconstruis jamais une URL d'image de mémoire). Puis check_build et finish."
  );
}
