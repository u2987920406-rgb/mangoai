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

const MAX_TRANSCRIPT_CHARS = 12_000; // même borne que MAX_TOOL_RESULT (contract.ts)

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

function formatResult(r: TranscriptResult): string {
  const lines: string[] = [];
  lines.push(`**${r.meta.titre}** — ${r.meta.chaine}${r.meta.dureeS ? ` (${formatDuration(r.meta.dureeS)})` : ""}`);
  if (r.meta.publieeLe) lines.push(`Publiée le ${r.meta.publieeLe}.`);
  if (r.meta.chapitres?.length) {
    lines.push(`Chapitres : ${r.meta.chapitres.map((c) => `${formatDuration(c.t)} ${c.titre}`).join(" · ")}`);
  }
  if (r.source === "absent") {
    lines.push(`⚠ Aucun transcript disponible (${r.raison ?? "raison inconnue"}).`);
    if (r.meta.description) lines.push(`Description (seule info dispo) : ${r.meta.description.slice(0, 1500)}`);
    return lines.join("\n");
  }
  lines.push(`Transcript (${r.source === "subs-manuels" ? "sous-titres manuels" : r.source === "subs-auto" ? "sous-titres auto" : "extrait par scraping"}, langue ${r.langue ?? "?"}) :`);
  let body = r.segments.map((s) => `[${formatDuration(s.tStartS)}] ${s.texte}`).join("\n");
  if (body.length > MAX_TRANSCRIPT_CHARS) {
    body = `${body.slice(0, MAX_TRANSCRIPT_CHARS)}\n[... transcript tronqué à ${MAX_TRANSCRIPT_CHARS} caractères — vidéo longue, demande une section précise si besoin]`;
  }
  lines.push(body);
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
      "sous-titre n'existe, tu reçois quand même les métadonnées et la description, avec une raison honnête.",
    inputSchema: {
      url: z.string().describe("URL YouTube (ex. https://www.youtube.com/watch?v=... ou https://youtu.be/...) ou id de vidéo"),
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
      used += 1;

      try {
        const r = await deps.fetch(url, {
          run: realRunner,
          corpus: "eleve-adhoc",
          scrape: { getBrowser: getBrowser as any, httpGet: (u) => fetch(u).then((res) => res.text()) },
        });
        return { text: formatResult(r) };
      } catch (e) {
        // fetchTranscript ne lève JAMAIS en principe — filet de sécurité quand même.
        return { text: `Lecture de la vidéo impossible (${(e as Error).message}). Continue sans cette info.`, isError: true };
      }
    },
  };

  return [tool];
}
