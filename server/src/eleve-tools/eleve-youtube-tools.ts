// Compréhension de vidéos YouTube pour l'Élève (2026-07-12) — demande de Raf : mettre
// en place l'outil de vision vidéo YouTube. L'infrastructure existait déjà (#177,
// `savoir/savoir-transcript.ts` : yt-dlp → repli scraping → cache disque, testée et
// éprouvée) mais n'était JAMAIS câblée à aucun outil ni route — infrastructure morte,
// jamais appelée en dehors des tests. Ce module la relie enfin à un outil réel.
//
// Approche : TRANSCRIPT horodaté + métadonnées (titre/chaîne/durée/chapitres), pas
// une analyse image-par-image (aucune infra ne fait ça, et le contenu PAROLE d'une
// vidéo est presque toujours plus informatif que ses pixels pour « comprendre » une
// vidéo — c'est l'approche que YouTube lui-même utilise pour l'indexation).
import { z } from "zod";
import type { KernelTool, KernelToolResult } from "../kernel/kernel-mcp.js";
import { fetchTranscript, realRunner, type TranscriptDeps, type TranscriptResult } from "../savoir/savoir-transcript.js";
import { getBrowser } from "../vision.js";

// (2026-07-12 suite) Cerveau LOCAL ($0) : le plafond n'existe pas pour économiser des
// tokens payants, mais pour respecter la fenêtre de contexte RÉELLE du modèle (Ollama
// num_ctx=16384 tokens par défaut, llm-transport.ts — ~55-60k car. pour TOUT : prompt
// système, historique, ce résultat, la réponse). Un transcript trop gros ferait déborder
// et Ollama tronquerait SILENCIEUSEMENT depuis le DÉBUT du contexte (risque de perdre le
// prompt système lui-même) — c'est la vraie perte d'info à éviter, pas le coût. yt-dlp
// télécharge le transcript COMPLET en un seul coup et le cache sur disque (savoir-transcript.ts)
// — il n'y a rien qui « continue en arrière-plan » à attendre : la pagination ci-dessous
// relit juste une PORTION du texte déjà en cache, donc instantanée dès le 2e appel.
const MAX_TRANSCRIPT_CHARS = 20_000;

function eleveYoutubeBudget(): number {
  const n = Number(process.env.ELEVE_YOUTUBE_BUDGET);
  return Number.isFinite(n) && n > 0 ? n : 5;
}

/** Dépendances injectables (tests sans réseau/process externe). */
export interface YoutubeVisionDeps {
  fetch: (url: string, deps: TranscriptDeps) => Promise<TranscriptResult>;
}

const realDeps: YoutubeVisionDeps = {
  fetch: (url, deps) => fetchTranscript(url, deps),
};

function formatDuration(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.round(s % 60);
  return h > 0 ? `${h}h${String(m).padStart(2, "0")}m${String(sec).padStart(2, "0")}s` : `${m}m${String(sec).padStart(2, "0")}s`;
}

/** Lien direct vers UN instant précis de la vidéo (le paramètre YouTube `&t=Ns`
 *  saute directement à cette seconde à l'ouverture). */
function timestampUrl(videoId: string, s: number): string {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&t=${Math.round(s)}s`;
}

/** Découpe le texte COMPLET en parties ~MAX_TRANSCRIPT_CHARS, coupées sur une frontière
 *  de ligne (jamais en plein milieu d'un segment horodaté). PUR. */
function paginateBody(fullBody: string, maxChars: number): string[] {
  if (fullBody.length <= maxChars) return [fullBody];
  const lines = fullBody.split("\n");
  const parts: string[] = [];
  let buf: string[] = [];
  let len = 0;
  for (const line of lines) {
    if (len > 0 && len + 1 + line.length > maxChars) {
      parts.push(buf.join("\n"));
      buf = [];
      len = 0;
    }
    buf.push(line);
    len += (len > 0 ? 1 : 0) + line.length;
  }
  if (buf.length) parts.push(buf.join("\n"));
  return parts;
}

function formatResult(r: TranscriptResult, partie: number): string {
  const lines: string[] = [];
  lines.push(`**${r.meta.titre}** — ${r.meta.chaine}${r.meta.dureeS ? ` (${formatDuration(r.meta.dureeS)})` : ""}`);
  if (r.meta.publieeLe) lines.push(`Publiée le ${r.meta.publieeLe}.`);
  if (r.meta.chapitres?.length) {
    lines.push(
      `Chapitres (lien direct vers l'instant précis) : ${r.meta.chapitres
        .map((c) => `[${formatDuration(c.t)} ${c.titre}](${timestampUrl(r.videoId, c.t)})`)
        .join(" · ")}`,
    );
  }
  if (r.source === "absent") {
    lines.push(`⚠ Aucun transcript disponible (${r.raison ?? "raison inconnue"}).`);
    if (r.meta.description) lines.push(`Description (seule info dispo) : ${r.meta.description.slice(0, 1500)}`);
    return lines.join("\n");
  }
  const fullBody = r.segments.map((s) => `[${formatDuration(s.tStartS)}] ${s.texte}`).join("\n");
  const parts = paginateBody(fullBody, MAX_TRANSCRIPT_CHARS);
  const idx = Math.min(Math.max(1, partie), parts.length) - 1;
  lines.push(`Transcript (${r.source === "subs-manuels" ? "sous-titres manuels" : r.source === "subs-auto" ? "sous-titres auto" : "extrait par scraping"}, langue ${r.langue ?? "?"}) — partie ${idx + 1}/${parts.length} :`);
  lines.push(parts[idx]);
  if (idx + 1 < parts.length) {
    lines.push(`\n[cette vidéo a ${parts.length} parties au total — rappelle lis_video_youtube avec la même url et partie:${idx + 2} pour lire la suite (déjà en cache, instantané) ; sinon synthétise ce que tu as déjà lu]`);
  }
  lines.push(
    `\n⚠ DANS TA RÉPONSE À L'UTILISATEUR : cite le timestamp [MM:SS] de chaque point important que tu mentionnes (ex. « à 2m30, il explique... »), pour qu'il puisse retrouver le passage rapidement s'il veut regarder la vidéo lui-même. Utilise ${timestampUrl(r.videoId, 0).replace("&t=0s", "&t=SECONDESs")} comme patron de lien direct vers un instant précis. Ne résume jamais sans indiquer OÙ dans la vidéo se trouve chaque info.`,
  );
  return lines.join("\n");
}

/** Construit l'outil `lis_video_youtube`. Budget par INSTANCE (= par tâche), comme
 *  les autres outils de vision. */
export function buildEleveYoutubeTools(deps: YoutubeVisionDeps = realDeps): KernelTool[] {
  let used = 0;

  const tool: KernelTool = {
    name: "lis_video_youtube",
    description:
      "Comprend une vidéo YouTube en lisant son TRANSCRIPT horodaté (sous-titres) + ses métadonnées " +
      "(titre, chaîne, durée, chapitres, description) — utile pour répondre à une question sur le contenu " +
      "d'une vidéo, résumer, ou en extraire une info précise. Donne l'URL YouTube (ou son id). Si aucun " +
      "sous-titre n'existe, tu reçois quand même les métadonnées et la description, avec une raison honnête. " +
      "Vidéo longue → transcript en PLUSIEURS PARTIES (indiqué dans la réponse) : rappelle l'outil avec la " +
      "MÊME url et `partie` incrémenté pour lire la suite (déjà en cache, instantané) — pas besoin de tout lire " +
      "si tu as déjà de quoi répondre. IMPORTANT : cite TOUJOURS le timestamp [MM:SS] de chaque info dans ta " +
      "réponse finale, pour que l'utilisateur puisse retrouver rapidement le passage dans la vidéo.",
    inputSchema: {
      url: z.string().describe("URL YouTube (ex. https://www.youtube.com/watch?v=... ou https://youtu.be/...) ou id de vidéo"),
      partie: z.number().optional().describe("Partie du transcript à lire si la vidéo est longue (défaut 1, la première)"),
    },
    handler: async (args): Promise<KernelToolResult> => {
      const budget = eleveYoutubeBudget();
      if (used >= budget) {
        return { text: `Budget vidéo épuisé (${budget} vidéos par tâche). N'en demande plus pour cette tâche.`, isError: true };
      }
      const url = String(args.url ?? "").trim();
      if (!url) {
        return { text: "Précise l'URL (ou l'id) de la vidéo YouTube.", isError: true };
      }
      const partieRaw = Number(args.partie ?? 1);
      const partie = Number.isFinite(partieRaw) && partieRaw >= 1 ? Math.floor(partieRaw) : 1;
      used += 1;

      try {
        const r = await deps.fetch(url, {
          run: realRunner,
          corpus: "eleve-adhoc",
          scrape: { getBrowser: getBrowser as any, httpGet: (u) => fetch(u).then((res) => res.text()) },
        });
        return { text: formatResult(r, partie) };
      } catch (e) {
        // fetchTranscript ne lève JAMAIS en principe — filet de sécurité quand même.
        return { text: `Lecture de la vidéo impossible (${(e as Error).message}). Continue sans cette info.`, isError: true };
      }
    },
  };

  return [tool];
}
