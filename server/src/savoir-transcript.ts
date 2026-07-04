// #177 É1 — savoir-transcript.ts : la sonde d'accès (le mur externe d'abord).
//
// Mission (voir docs/plan-177-video-connaissance.md, D1/É1) : une interface UNIQUE,
// indépendante de la voie d'accès, pour récupérer le transcript horodaté d'une vidéo
// YouTube — et la chaîne de dégradation qui la rend fiable :
//   yt-dlp (voie primaire, CommandRunner injecté, pattern secret-vault.ts §bws /
//   eleve-unity-tools.ts §UNITY_PATH) → scraping maison en repli (réutilise getBrowser()
//   de vision.ts) → métadonnées seules (jamais d'invention de contenu) → cache disque à vie.
//
// Règles non négociables :
//   - `fetchTranscript` NE LÈVE JAMAIS. Toute panne se résout en source:"absent" +
//     une raison honnête (jamais un throw qui remonte casser l'appelant).
//   - Aucune dépendance npm native nouvelle. yt-dlp reste un outil EXTERNE appelé via
//     un CommandRunner injecté — jamais vendorisé.
//   - Gate SAVOIR_TRANSCRIPT (flags.ts), défaut OFF — ce module lui-même reste pur/
//     appelable sans le gate (le gate protège les SURFACES qui l'exposeront : outil
//     Élève / route, à venir en É6). Politesse : délai + budget par run (§ci-dessous).
//   - Tout contenu externe (transcript, description, titre) est de la DONNÉE : il ne
//     doit JAMAIS être interprété comme instruction par un appelant en aval — voir
//     `sanitizeExternal` (agent-contract.ts), à appliquer par le CONSOMMATEUR (outil
//     Élève #177 É6), pas ici (ce module renvoie de la donnée structurée typée).

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { spawn } from "node:child_process";

// ── Interface publique (D1) ───────────────────────────────────────────────────

export interface TranscriptSegment {
  tStartS: number;
  tEndS: number;
  texte: string;
}

export interface TranscriptMeta {
  titre: string;
  chaine: string;
  dureeS: number;
  publieeLe?: string;
  description?: string;
  chapitres?: { t: number; titre: string }[];
}

export type TranscriptSource = "subs-manuels" | "subs-auto" | "scrape-maison" | "absent";

export interface TranscriptResult {
  videoId: string;
  meta: TranscriptMeta;
  source: TranscriptSource;
  langue?: string;
  segments: TranscriptSegment[]; // vide si absent
  /** Raison honnête quand source === "absent" (jamais d'invention de contenu). */
  raison?: string;
}

export interface ChannelVideo {
  videoId: string;
  titre: string;
  publieeLe?: string;
}

// ── CommandRunner injecté (pattern secret-vault.ts createBwsBackend /
//    eleve-unity-tools.ts UNITY_PATH) — jamais un vrai spawn hors des deps réelles. ──

export type CommandRunner = (
  cmd: string,
  args: string[],
  opts?: { timeoutMs?: number },
) => Promise<{ stdout: string; stderr: string; code: number }>;

/** Vrai lanceur (child_process.spawn) — utilisé en prod, jamais dans les tests purs. */
export const realRunner: CommandRunner = (cmd, args, opts) =>
  new Promise((resolve) => {
    try {
      const child = spawn(cmd, args, { windowsHide: true });
      // Fix L78-5 (mojibake) : on ACCUMULE des Buffers bruts et on décode UTF-8 UNE
      // seule fois à la fin. `chunk.toString()` par morceau corrompt tout caractère
      // multi-octets (accents FR) coupé à la frontière de deux chunks du flux stdout
      // — c'est la source du « � » constaté dans les titres/description yt-dlp (-J),
      // qui remontait ensuite dans le prompt du juge (resume/arbitrage).
      const outChunks: Buffer[] = [];
      const errChunks: Buffer[] = [];
      const timer = opts?.timeoutMs
        ? setTimeout(() => {
            try {
              child.kill();
            } catch {
              /* ignore */
            }
          }, opts.timeoutMs)
        : null;
      child.stdout?.on("data", (d) => outChunks.push(Buffer.isBuffer(d) ? d : Buffer.from(d)));
      child.stderr?.on("data", (d) => errChunks.push(Buffer.isBuffer(d) ? d : Buffer.from(d)));
      child.on("error", () => {
        if (timer) clearTimeout(timer);
        resolve({ stdout: Buffer.concat(outChunks).toString("utf8"), stderr: Buffer.concat(errChunks).toString("utf8"), code: 127 }); // binaire introuvable
      });
      child.on("close", (code) => {
        if (timer) clearTimeout(timer);
        resolve({ stdout: Buffer.concat(outChunks).toString("utf8"), stderr: Buffer.concat(errChunks).toString("utf8"), code: code ?? 1 });
      });
    } catch {
      resolve({ stdout: "", stderr: "spawn indisponible", code: 127 });
    }
  });

// ── Repli maison (D1, REPLI n°2) : une page/un navigateur injectés ────────────

/** Sous-ensemble minimal de Playwright utilisé par le repli — permet l'injection en test
 *  sans dépendre du type exact exporté par `playwright`. */
export interface ScrapePage {
  goto(url: string, opts?: Record<string, unknown>): Promise<unknown>;
  evaluate<T>(fn: (...a: unknown[]) => T): Promise<T>;
  close(): Promise<void>;
}
export interface ScrapeBrowserLike {
  newPage(): Promise<ScrapePage>;
}

export interface ScrapeDeps {
  getBrowser: () => Promise<ScrapeBrowserLike>;
  /** GET brut (baseUrl timedtext) — injectable pour les tests, sinon `fetch` global. */
  httpGet: (url: string) => Promise<string>;
}

// ── Politesse : délai entre requêtes + budget par run ─────────────────────────

export function fetchDelayMs(): number {
  const raw = process.env.SAVOIR_FETCH_DELAY_MS;
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : 4000;
}

export function fetchMax(): number {
  const raw = process.env.SAVOIR_FETCH_MAX;
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : Infinity;
}

// ── Parseur VTT + dédup (référence de comportement : script transcript.py du skill
//    Claude `lire-youtube` de Raf — même mécanique, réécrite en TS). ─────────────

const VTT_TS = /(\d{2}):(\d{2}):(\d{2})[.,](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[.,](\d{3})/;

function stripTags(line: string): string {
  return line
    .replace(/<[^>]+>/g, "") // balises de timing inline des sous-titres auto (<00:00:01.234>)
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .trim();
}

/**
 * Dédup FENÊTRE-GLISSANTE des sous-titres auto YouTube (fix L78-1, cause racine).
 * PUR. Les sous-titres auto anglais (et souvent FR) défilent en « rolling window » :
 * chaque cue reprend la fin de la précédente et ajoute la suite, si bien qu'un même
 * bout de phrase apparaît dans 2-3 cues consécutives. `resegmentCues` collait
 * ensuite ces cues bout à bout → verbatim « X X X » triplé promu canon (32 claims).
 *
 * Mécanique : on maintient une FENÊTRE de mots déjà émis (bornée) ; pour chaque
 * nouvelle cue on cherche le plus grand recouvrement suffixe(queue)↔préfixe(cue),
 * et on n'émet QUE les mots réellement nouveaux. Cela absorbe à la fois :
 *   - l'EXTENSION pure (cue = précédente + suite → on n'ajoute que la suite),
 *   - le RECOUVREMENT partiel (la cue reprend la fin de la précédente puis continue),
 *   - la répétition EXACTE (recouvrement total → cue entièrement absorbée, rien émis).
 * Comparaison insensible à la casse ; les timestamps de chaque cue émise sont
 * préservés (t_start = la cue d'origine). Borne de queue = 60 mots : le
 * recouvrement rolling est toujours local aux cues voisines, jamais à distance.
 */
export function dedupRollingCues(cues: TranscriptSegment[]): TranscriptSegment[] {
  const out: TranscriptSegment[] = [];
  const MAX_TAIL = 60;
  let tail: string[] = []; // mots déjà émis (fenêtre bornée), pour la comparaison
  for (const cue of cues) {
    const words = (cue.texte ?? "").split(/\s+/).filter(Boolean);
    if (words.length === 0) continue;
    const maxK = Math.min(tail.length, words.length);
    let k = 0;
    for (let cand = maxK; cand >= 1; cand--) {
      let match = true;
      for (let i = 0; i < cand; i++) {
        if (tail[tail.length - cand + i].toLowerCase() !== words[i].toLowerCase()) {
          match = false;
          break;
        }
      }
      if (match) {
        k = cand;
        break;
      }
    }
    const fresh = words.slice(k);
    if (fresh.length === 0) continue; // cue entièrement redondante (répétition/extension déjà vue)
    out.push({ tStartS: cue.tStartS, tEndS: cue.tEndS, texte: fresh.join(" ") });
    tail.push(...fresh);
    if (tail.length > MAX_TAIL) tail = tail.slice(-MAX_TAIL);
  }
  return out;
}

/**
 * VTT → segments horodatés, PUR (aucune I/O). Fusionne les lignes d'une même cue,
 * puis déduplique la FENÊTRE GLISSANTE des sous-titres auto YouTube (via
 * `dedupRollingCues` — pas seulement les cues consécutives IDENTIQUES : aussi les
 * extensions et recouvrements partiels, cf. fix L78-1).
 */
export function parseVtt(vttText: string): TranscriptSegment[] {
  const raw: TranscriptSegment[] = [];
  let curStart: number | null = null;
  let curEnd: number | null = null;
  let buf: string[] = [];

  const flush = () => {
    if (buf.length === 0) return;
    const texte = buf.join(" ").replace(/\s+/g, " ").trim();
    buf = [];
    if (texte && curStart !== null && curEnd !== null) {
      raw.push({ tStartS: curStart, tEndS: curEnd, texte });
    }
  };

  const lines = (vttText ?? "").split(/\r?\n/);
  for (const line0 of lines) {
    const line = line0.trim();
    const m = VTT_TS.exec(line);
    if (m) {
      flush();
      const [, h1, m1, s1, ms1, h2, m2, s2, ms2] = m;
      curStart = Number(h1) * 3600 + Number(m1) * 60 + Number(s1) + Number(ms1) / 1000;
      curEnd = Number(h2) * 3600 + Number(m2) * 60 + Number(s2) + Number(ms2) / 1000;
      continue;
    }
    if (!line) {
      flush();
      continue;
    }
    if (line === "WEBVTT" || /^(Kind|Language|NOTE|STYLE|Region):/i.test(line) || /^\d+$/.test(line)) {
      continue; // en-tête, cue-id numérique, métadonnées
    }
    const text = stripTags(line);
    if (text) buf.push(text);
  }
  flush();
  return dedupRollingCues(raw);
}

// ── Re-segmentation ~400-700 caractères (frontières de cues, timestamps préservés) ──
//
// Finding d'É3 (2026-07-04) : le garde-fou verbatim rejette énormément sur des CUES
// BRUTES (courtes, ~2-3 s) — un `extrait` que le LLM copie chevauche presque toujours
// la frontière de deux cues, donc n'est retrouvé DANS AUCUN segment isolé (rejet ~81 %).
// En fusionnant les cues en segments ~400-700 caractères AVANT extraction, l'extrait
// tient dans un seul segment et le rejet tombe à ~10 %. C'est ce que D4 du plan appelle
// « segmentation ~400-700 caractères, coupée aux frontières de cues, timestamps préservés ».
// PUR : ne fusionne JAMAIS deux cues au milieu d'un mot (on colle les textes avec un
// espace), le t_start est celui de la 1ʳᵉ cue du bloc, le t_end celui de la dernière.

export interface SegmentBounds {
  minChars: number;
  maxChars: number;
}

export const DEFAULT_SEGMENT_BOUNDS: SegmentBounds = { minChars: 400, maxChars: 700 };

/**
 * Fusionne des cues brutes (VTT) en segments plus longs (~`minChars`-`maxChars`),
 * en respectant les frontières de cues (jamais de coupe en plein milieu d'une cue)
 * et en préservant les timestamps (t_start = 1ʳᵉ cue, t_end = dernière). PUR.
 *
 * Règle d'accumulation : on empile les cues tant que la longueur reste sous
 * `maxChars` ; dès qu'on a atteint `minChars`, la cue suivante qui ferait dépasser
 * `maxChars` ouvre un nouveau segment. Une cue seule plus longue que `maxChars`
 * forme son propre segment (on ne la coupe pas — frontière de cue respectée).
 */
export function resegmentCues(
  cues: TranscriptSegment[],
  bounds: SegmentBounds = DEFAULT_SEGMENT_BOUNDS,
): TranscriptSegment[] {
  const minChars = Math.max(1, bounds.minChars);
  const maxChars = Math.max(minChars, bounds.maxChars);
  const clean = (cues ?? []).filter((c) => c && typeof c.texte === "string" && c.texte.trim().length > 0);
  const out: TranscriptSegment[] = [];

  let buf: string[] = [];
  let start: number | null = null;
  let end = 0;
  let len = 0;

  const flush = () => {
    if (buf.length === 0 || start === null) return;
    out.push({ tStartS: start, tEndS: end, texte: buf.join(" ").replace(/\s+/g, " ").trim() });
    buf = [];
    start = null;
    len = 0;
  };

  for (const c of clean) {
    const piece = c.texte.trim();
    // Si le buffer a déjà atteint le minimum et que l'ajout ferait dépasser le max,
    // on clôt le segment courant AVANT d'ajouter cette cue (coupe à la frontière).
    if (buf.length > 0 && len >= minChars && len + 1 + piece.length > maxChars) flush();
    if (start === null) start = c.tStartS;
    buf.push(piece);
    end = c.tEndS;
    len += (len > 0 ? 1 : 0) + piece.length;
  }
  flush();
  return out;
}

// ── Cache disque à vie : server/data/savoir/<corpus>/transcripts/<videoId>.json ──

export function defaultDataDir(): string {
  return path.join(process.cwd(), "data", "savoir");
}

function cacheFile(dataDir: string, corpus: string, videoId: string): string {
  return path.join(dataDir, corpus, "transcripts", `${videoId}.json`);
}

function readCache(dataDir: string, corpus: string, videoId: string): TranscriptResult | null {
  try {
    const p = cacheFile(dataDir, corpus, videoId);
    if (!fs.existsSync(p)) return null;
    const raw = fs.readFileSync(p, "utf-8");
    const parsed = JSON.parse(raw) as TranscriptResult;
    if (parsed && typeof parsed === "object" && parsed.videoId) return parsed;
    return null;
  } catch {
    return null; // cache corrompu → on re-fetch, jamais de throw
  }
}

function writeCache(dataDir: string, corpus: string, result: TranscriptResult): void {
  try {
    const p = cacheFile(dataDir, corpus, result.videoId);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(result, null, 2), "utf-8");
  } catch {
    // Cache best-effort : un échec d'écriture ne doit jamais faire échouer le fetch.
  }
}

// ── Deps d'entrée de fetchTranscript ──────────────────────────────────────────

export interface TranscriptDeps {
  run: CommandRunner;
  /** Slug du corpus (ex. "agentic-harness") → dossier de cache dédié. */
  corpus: string;
  /** Racine des données savoir (override en test) — défaut server/data/savoir. */
  dataDir?: string;
  /** Repli maison (D1, REPLI n°2) — optionnel : si absent, l'étage est simplement sauté. */
  scrape?: ScrapeDeps;
  /** Langues préférées, ordre décroissant (défaut fr, fr-orig, en). */
  langs?: string;
  /** Horloge injectable (tests déterministes). */
  now?: () => number;
}

function extractVideoId(input: string): string {
  const s = (input ?? "").trim();
  try {
    const u = new URL(s);
    if (u.hostname.includes("youtu.be")) return u.pathname.replace(/^\//, "");
    const v = u.searchParams.get("v");
    if (v) return v;
    const m = u.pathname.match(/\/(embed|shorts)\/([^/?]+)/);
    if (m) return m[2];
  } catch {
    /* pas une URL — on suppose que c'est déjà un videoId */
  }
  return s;
}

interface YtDlpJson {
  title?: string;
  uploader?: string;
  channel?: string;
  duration?: number;
  upload_date?: string; // YYYYMMDD
  description?: string;
  chapters?: Array<{ start_time?: number; title?: string }>;
  requested_subtitles?: Record<string, { url?: string; ext?: string }>;
  automatic_captions?: Record<string, unknown>;
  subtitles?: Record<string, unknown>;
}

function isoFromYtDlpDate(d?: string): string | undefined {
  if (!d || !/^\d{8}$/.test(d)) return undefined;
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
}

function watchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
}

/** Choisit la ligne la plus informative d'une sortie yt-dlp pour une raison HONNÊTE :
 *  une ligne "ERROR:" prime sur les "WARNING:" (bruit récurrent, ex. version obsolète)
 *  qui, sinon, masquaient systématiquement la vraie cause (429, sous-titres absents…). */
function pickReasonLine(text: string): string {
  const lines = (text ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
  const errLine = lines.find((l) => /^ERROR:/i.test(l));
  return errLine ?? lines[0] ?? "";
}

/** Étage 1 (D1) : yt-dlp — métadonnées + sous-titres (manuels > auto ; fr > en). */
async function tryYtDlp(
  videoId: string,
  deps: TranscriptDeps,
): Promise<TranscriptResult | { absentRaison: string } | null> {
  const url = watchUrl(videoId);
  const langs = deps.langs ?? "fr,fr-orig,en";

  let meta: YtDlpJson;
  try {
    const r = await deps.run("python", ["-m", "yt_dlp", "-J", "--skip-download", url], { timeoutMs: 60_000 });
    if (r.code !== 0) {
      return { absentRaison: `yt-dlp introuvable ou en échec : ${pickReasonLine(r.stderr || r.stdout) || "pip install yt-dlp"}` };
    }
    meta = JSON.parse(r.stdout) as YtDlpJson;
  } catch (e) {
    return { absentRaison: `yt-dlp introuvable : pip install yt-dlp (${e instanceof Error ? e.message : String(e)})` };
  }

  const metaOut: TranscriptMeta = {
    titre: meta.title ?? "(titre inconnu)",
    chaine: meta.uploader ?? meta.channel ?? "(chaîne inconnue)",
    dureeS: typeof meta.duration === "number" ? meta.duration : 0,
    publieeLe: isoFromYtDlpDate(meta.upload_date),
    description: meta.description,
    chapitres: Array.isArray(meta.chapters)
      ? meta.chapters
          .filter((c) => typeof c.start_time === "number" && c.title)
          .map((c) => ({ t: Math.round(c.start_time as number), titre: c.title as string }))
      : undefined,
  };

  // Sous-titres : écriture réelle (fichier VTT) dans un dossier temporaire dédié.
  // Découverte en usage réel (2026-07-04) : demander plusieurs langues en UN seul appel
  // yt-dlp (`--sub-langs "fr,en"`) échoue ATOMIQUEMENT si la première langue tentée
  // n'existe qu'en piste AUTO-TRADUITE — YouTube rate-limite (429) la traduction à la
  // volée indépendamment des pistes natives déjà prêtes. Une vidéo sans piste fr native
  // mais avec une piste en NATIVE échouait donc entièrement, alors que `en` seul réussit
  // instantanément. Correctif : tenter chaque langue de `langs` INDIVIDUELLEMENT, dans
  // l'ordre de priorité, s'arrêter à la première qui produit un fichier VTT — un échec
  // (429, langue absente) sur une langue ne doit jamais faire échouer la suivante.
  let tmpDir: string | null = null;
  try {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "savoir-vtt-"));
    const outTmpl = path.join(tmpDir, "%(id)s.%(ext)s");
    let files: string[] = [];
    let lastReason = "";
    for (const lang of langs.split(",").map((l) => l.trim()).filter(Boolean)) {
      const r = await deps.run(
        "python",
        ["-m", "yt_dlp", "--skip-download", "--write-subs", "--write-auto-subs", "--sub-langs", lang, "--sub-format", "vtt", "-o", outTmpl, url],
        { timeoutMs: 90_000 },
      );
      files = fs.existsSync(tmpDir) ? fs.readdirSync(tmpDir).filter((f) => f.endsWith(".vtt")) : [];
      if (files.length > 0) break;
      lastReason = pickReasonLine(r.stderr || r.stdout) || lastReason;
    }
    if (files.length === 0) {
      return {
        videoId,
        meta: metaOut,
        source: "absent",
        segments: [],
        raison: `aucun sous-titre disponible (${lastReason || "muet"})`,
      };
    }
    // Priorité : manuel avant auto ; dans l'ordre de `langs` sinon.
    const scored = files
      .map((f) => {
        const isAuto = f.includes(".auto.") || /\.a\.\w+\.vtt$/.test(f);
        const langMatch = /\.([a-zA-Z-]+)\.vtt$/.exec(f);
        const lang = langMatch ? langMatch[1] : "?";
        const langRank = langs.split(",").findIndex((l) => l.trim() === lang);
        return { f, isAuto, lang, langRank: langRank < 0 ? 999 : langRank };
      })
      .sort((a, b) => Number(a.isAuto) - Number(b.isAuto) || a.langRank - b.langRank);
    const chosen = scored[0];
    const vttText = fs.readFileSync(path.join(tmpDir, chosen.f), "utf-8");
    const segments = parseVtt(vttText);
    return {
      videoId,
      meta: metaOut,
      source: chosen.isAuto ? "subs-auto" : "subs-manuels",
      langue: chosen.lang,
      segments,
    };
  } catch (e) {
    return {
      videoId,
      meta: metaOut,
      source: "absent",
      segments: [],
      raison: `échec de récupération des sous-titres : ${e instanceof Error ? e.message : String(e)}`,
    };
  } finally {
    if (tmpDir) {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        /* best-effort cleanup */
      }
    }
  }
}

/** Étage 2 (D1, REPLI n°2) : scraping maison — ytInitialPlayerResponse.captions. */
async function tryScrape(videoId: string, scrape: ScrapeDeps): Promise<TranscriptResult | null> {
  try {
    const browser = await scrape.getBrowser();
    const page = await browser.newPage();
    try {
      await page.goto(watchUrl(videoId), { waitUntil: "load", timeout: 15_000 });
      const extracted = await page.evaluate(() => {
        // Exécuté DANS la page — cette fonction est sérialisée par Playwright.
        const w = window as unknown as { ytInitialPlayerResponse?: unknown };
        return w.ytInitialPlayerResponse ?? null;
      });
      if (!extracted) return null;
      const player = extracted as {
        videoDetails?: { title?: string; author?: string; lengthSeconds?: string };
        captions?: {
          playerCaptionsTracklistRenderer?: {
            captionTracks?: Array<{ baseUrl?: string; languageCode?: string; kind?: string }>;
          };
        };
      };
      const tracks = player.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
      if (tracks.length === 0) return null;
      const chosen = tracks.find((t) => t.languageCode?.startsWith("fr")) ?? tracks.find((t) => t.languageCode?.startsWith("en")) ?? tracks[0];
      if (!chosen?.baseUrl) return null;
      const vttUrl = `${chosen.baseUrl}${chosen.baseUrl.includes("?") ? "&" : "?"}fmt=vtt`;
      const vttText = await scrape.httpGet(vttUrl);
      const segments = parseVtt(vttText);
      if (segments.length === 0) return null;
      return {
        videoId,
        meta: {
          titre: player.videoDetails?.title ?? "(titre inconnu)",
          chaine: player.videoDetails?.author ?? "(chaîne inconnue)",
          dureeS: Number(player.videoDetails?.lengthSeconds ?? 0),
        },
        source: "scrape-maison",
        langue: chosen.languageCode,
        segments,
      };
    } finally {
      await page.close().catch(() => {});
    }
  } catch {
    return null; // repli silencieux → l'appelant retombe sur métadonnées-seules
  }
}

/**
 * Récupère le transcript d'une vidéo. NE LÈVE JAMAIS : toute panne se résout en
 * `source: "absent"` avec une `raison` honnête. Cache disque à vie : une vidéo déjà
 * ingérée n'est plus jamais re-demandée à YouTube.
 */
export async function fetchTranscript(videoIdOrUrl: string, deps: TranscriptDeps): Promise<TranscriptResult> {
  const videoId = extractVideoId(videoIdOrUrl);
  const dataDir = deps.dataDir ?? defaultDataDir();

  const cached = readCache(dataDir, deps.corpus, videoId);
  if (cached) return cached;

  try {
    const ytdlp = await tryYtDlp(videoId, deps);
    if (ytdlp && !("absentRaison" in ytdlp)) {
      writeCache(dataDir, deps.corpus, ytdlp);
      return ytdlp;
    }

    const ytdlpRaison = ytdlp && "absentRaison" in ytdlp ? ytdlp.absentRaison : undefined;

    if (deps.scrape) {
      const scraped = await tryScrape(videoId, deps.scrape);
      if (scraped) {
        writeCache(dataDir, deps.corpus, scraped);
        return scraped;
      }
    }

    const result: TranscriptResult = {
      videoId,
      meta: { titre: "(titre inconnu)", chaine: "(chaîne inconnue)", dureeS: 0 },
      source: "absent",
      segments: [],
      raison: ytdlpRaison ?? "aucune voie d'accès n'a produit de transcript (yt-dlp et repli maison indisponibles)",
    };
    writeCache(dataDir, deps.corpus, result);
    return result;
  } catch (e) {
    // Filet de sécurité ultime : ne JAMAIS laisser une exception remonter.
    return {
      videoId,
      meta: { titre: "(titre inconnu)", chaine: "(chaîne inconnue)", dureeS: 0 },
      source: "absent",
      segments: [],
      raison: `erreur inattendue : ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

/** Énumération de chaîne (D1) : `yt-dlp --flat-playlist -J <chaîne>/videos`. Ne lève jamais. */
export async function listChannelVideos(channelUrl: string, deps: Pick<TranscriptDeps, "run">): Promise<ChannelVideo[]> {
  try {
    const base = channelUrl.trim().replace(/\/+$/, "");
    const url = /\/videos$/.test(base) ? base : `${base}/videos`;
    const r = await deps.run("python", ["-m", "yt_dlp", "--flat-playlist", "-J", "--skip-download", url], { timeoutMs: 120_000 });
    if (r.code !== 0) return [];
    const json = JSON.parse(r.stdout) as { entries?: Array<{ id?: string; title?: string; upload_date?: string; timestamp?: number }> };
    const entries = Array.isArray(json.entries) ? json.entries : [];
    return entries
      .filter((e) => typeof e.id === "string")
      .map((e) => ({
        videoId: e.id as string,
        titre: e.title ?? "(titre inconnu)",
        publieeLe: isoFromYtDlpDate(e.upload_date) ?? (e.timestamp ? new Date(e.timestamp * 1000).toISOString().slice(0, 10) : undefined),
      }));
  } catch {
    return [];
  }
}

/**
 * Boucle séquentielle avec politesse (D1) : délai entre requêtes + budget par run.
 * Utile aux appelants batch (énumération de chaîne, run-savoir.ts à venir en É4) —
 * ne fait rien de plus que respecter SAVOIR_FETCH_DELAY_MS / SAVOIR_FETCH_MAX autour
 * d'appels individuels à fetchTranscript.
 */
export async function fetchTranscriptsSequential(
  videoIds: string[],
  deps: TranscriptDeps & { delayMs?: number; max?: number; sleep?: (ms: number) => Promise<void> },
): Promise<TranscriptResult[]> {
  const delay = deps.delayMs ?? fetchDelayMs();
  const max = deps.max ?? fetchMax();
  const sleep = deps.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const out: TranscriptResult[] = [];
  for (let i = 0; i < videoIds.length && out.length < max; i++) {
    if (i > 0 && delay > 0) await sleep(delay);
    out.push(await fetchTranscript(videoIds[i], deps));
  }
  return out;
}
