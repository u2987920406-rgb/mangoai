import "dotenv/config";
// #177 É4 — run-savoir.ts (D4) : le RUNNER d'ingestion resumable par manifest.
//
//   npx tsx src/run-savoir.ts --corpus <slug> [videoIdOrUrl...]
//   Reprend : même commande — les vidéos déjà `extraite` (manifest) sont sautées.
//
// Orchestration PAR VIDÉO (une unité bornée, jamais un run agentique géant) :
//   fetch transcript (É1, cache disque à vie) → RE-SEGMENTATION ~400-700 car
//   (frontières de cues, timestamps préservés — le morceau manquant identifié par
//   l'agent É3) → embeddings segments (safeEmbed, fail-open) → extraction claims
//   (É3, GLM → candidat) → coche le manifest. Puis, quand TOUTES les vidéos du lot
//   sont extraites : UNE passe de réconciliation GLOBALE (D3, savoir-reconcile.ts).
//
// État inter-runs : server/data/savoir/<slug>/corpus.json (patron run-toeic-content.ts
// / #181 D6). Kill -9 → relance → reprend à la 1ʳᵉ vidéo non faite.
//
// Gate SAVOIR_RUNNER (flags.ts) défaut OFF : aucune surface AUTO ne lance ce runner.
// Le lancer en CLI est l'opt-in explicite d'un opérateur — main() procède donc, en
// signalant l'état du gate. Les fonctions d'orchestration sont exportées (deps
// injectées) pour le test de preuve.

import * as fs from "node:fs";
import * as path from "node:path";
import { askLLM } from "./llm-engine.js";
import { safeEmbed } from "./notes-rag.js";
import { dispatch } from "./brain-dispatch.js";
import { flag } from "./flags.js";
import {
  fetchTranscript,
  realRunner,
  resegmentCues,
  DEFAULT_SEGMENT_BOUNDS,
  type SegmentBounds,
  type TranscriptResult,
} from "./savoir-transcript.js";
import { SavoirStore, savoirDataDir, savoirDbPath } from "./savoir-store.js";
import { extractClaimsForVideo } from "./savoir-extraction.js";
import { reconcileCorpus, type ReconcileResult } from "./savoir-reconcile.js";

// ── GLM (l'exécutant $0-Claude), patron run-toeic-content.ts ────────────────
const GLM = {
  provider: "openai" as const,
  model: process.env.ELEVE_MODEL || "glm-5.2:cloud",
  baseUrl: process.env.ELEVE_API_URL,
  apiKeyEnv: "ELEVE_API_KEY",
  timeoutMs: 180_000,
  maxTokens: 6000,
};

export function glmAsk(system: string, user: string): Promise<string> {
  return askLLM(system, user, {
    provider: GLM.provider,
    model: GLM.model,
    baseUrl: GLM.baseUrl,
    apiKeyEnv: GLM.apiKeyEnv,
    timeoutMs: GLM.timeoutMs,
    maxTokens: GLM.maxTokens,
  });
}

// ── Manifest (corpus.json) ───────────────────────────────────────────────────

export type VideoManifestStatut = "a_ingerer" | "transcrite" | "extraite" | "sans_transcript";

export interface VideoManifestEntry {
  youtubeId: string;
  statut: VideoManifestStatut;
  titre?: string;
  source?: string;
  segments?: number;
  claims?: number;
  rejected?: number;
}

export interface CorpusManifest {
  slug: string;
  langue?: string;
  seuil?: number;
  videos: VideoManifestEntry[];
  reconciled?: boolean;
}

export function manifestPath(slug: string): string {
  return path.join(savoirDataDir(), slug, "corpus.json");
}

export function loadManifest(slug: string): CorpusManifest | null {
  try {
    const p = manifestPath(slug);
    if (!fs.existsSync(p)) return null;
    const m = JSON.parse(fs.readFileSync(p, "utf-8")) as CorpusManifest;
    if (m && Array.isArray(m.videos)) return m;
    return null;
  } catch {
    return null;
  }
}

export function saveManifest(m: CorpusManifest): void {
  try {
    const p = manifestPath(m.slug);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(m, null, 2), "utf-8");
  } catch (e) {
    console.warn("[run-savoir] manifest non sauvé :", e instanceof Error ? e.message : String(e));
  }
}

// ── Deps injectées (testable) ────────────────────────────────────────────────

export interface RunnerDeps {
  fetch: (videoId: string) => Promise<TranscriptResult>;
  ask: (system: string, user: string) => Promise<string>;
  embed?: (text: string) => Promise<number[] | null>;
  dispatch: (
    agentId: "juge",
    system: string,
    user: string,
    opts: { trustExternal?: boolean; freeform?: boolean },
  ) => Promise<{ status: string; summary?: string }>;
  log?: (msg: string) => void;
}

export interface RunnerOptions {
  bounds?: SegmentBounds;
  langue?: string;
  seuil?: number;
}

/**
 * Ingère UNE vidéo : transcript (cache) → re-segmentation → insert video+segments
 * (embeddings best-effort) → extraction claims. Idempotent : une vidéo déjà en base
 * n'est pas ré-insérée (on saute). Renvoie l'entrée de manifest mise à jour. */
export async function ingestVideo(
  store: SavoirStore,
  youtubeId: string,
  deps: RunnerDeps,
  opts: RunnerOptions = {},
): Promise<VideoManifestEntry> {
  const log = deps.log ?? (() => {});
  const bounds = opts.bounds ?? DEFAULT_SEGMENT_BOUNDS;

  const existing = store.getVideoByYoutubeId(youtubeId);
  if (existing && (existing.statut === "extraite" || existing.statut === "reconciliee")) {
    log(`  = ${youtubeId} déjà extraite — saut`);
    return { youtubeId, statut: "extraite", titre: existing.titre, source: existing.transcript_source };
  }

  const tr = await deps.fetch(youtubeId);
  if (tr.source === "absent" || tr.segments.length === 0) {
    if (!existing) {
      store.insertVideo({
        youtubeId,
        titre: tr.meta.titre,
        chaine: tr.meta.chaine,
        dureeS: tr.meta.dureeS,
        publieeLe: tr.meta.publieeLe,
        transcriptSource: "absent",
        langue: tr.langue,
        statut: "sans_transcript",
        fetchedAt: Math.floor(Date.now() / 1000),
      });
    }
    log(`  ⚠ ${youtubeId} sans transcript (${tr.raison ?? "?"})`);
    return { youtubeId, statut: "sans_transcript", titre: tr.meta.titre, source: "absent" };
  }

  // Re-segmentation ~400-700 car (frontières de cues, timestamps préservés).
  const segs = resegmentCues(tr.segments, bounds);

  let videoDbId: number;
  if (existing) {
    videoDbId = existing.id;
  } else {
    videoDbId = store.insertVideo({
      youtubeId,
      titre: tr.meta.titre,
      chaine: tr.meta.chaine,
      dureeS: tr.meta.dureeS,
      publieeLe: tr.meta.publieeLe,
      transcriptSource: tr.source,
      langue: tr.langue,
      statut: "transcrite",
      fetchedAt: Math.floor(Date.now() / 1000),
    });
    for (const s of segs) {
      let emb: number[] | undefined;
      if (deps.embed) {
        try {
          const v = await deps.embed(s.texte);
          if (Array.isArray(v) && v.length > 0) emb = v;
        } catch {
          /* embedding best-effort */
        }
      }
      store.insertSegment({ videoId: videoDbId, tStartS: Math.round(s.tStartS), tEndS: Math.round(s.tEndS), texte: s.texte, embedding: emb });
    }
  }
  log(`  → ${youtubeId} : ${segs.length} segments (${tr.source}, ${tr.langue ?? "?"}) — extraction claims…`);

  const extr = await extractClaimsForVideo(
    store,
    videoDbId,
    { ask: deps.ask, embed: deps.embed ? (t) => deps.embed!(t) : undefined },
    { langue: opts.langue ?? (tr.langue?.startsWith("fr") ? "français" : "anglais") },
  );
  store.updateVideoStatut(videoDbId, "extraite");
  const rejectRate = extr.proposed > 0 ? Math.round((extr.rejected / extr.proposed) * 100) : 0;
  log(`    ✓ ${youtubeId} : ${extr.inserted} claims insérés / ${extr.proposed} proposés (${extr.rejected} rejetés ${rejectRate}%, ${extr.duplicates} doublons écartés)`);
  return {
    youtubeId,
    statut: "extraite",
    titre: tr.meta.titre,
    source: tr.source,
    segments: segs.length,
    claims: extr.inserted,
    rejected: extr.rejected,
  };
}

export interface IngestCorpusResult {
  manifest: CorpusManifest;
  reconcile?: ReconcileResult;
  totalClaims: number;
  totalProposed: number;
  totalRejected: number;
  rejectRate: number;
}

/**
 * Ingère un corpus complet (resumable). Ouvre la base du corpus, ingère chaque
 * vidéo (saut si déjà extraite), sauve le manifest après CHAQUE vidéo (reprise),
 * puis lance UNE passe de réconciliation globale quand tout est extrait. */
export async function ingestCorpus(
  slug: string,
  youtubeIds: string[],
  deps: RunnerDeps,
  opts: RunnerOptions = {},
): Promise<IngestCorpusResult> {
  const log = deps.log ?? (() => {});
  const store = new SavoirStore(savoirDbPath(slug));

  let manifest = loadManifest(slug);
  if (!manifest) {
    manifest = { slug, langue: opts.langue, seuil: opts.seuil, videos: youtubeIds.map((id) => ({ youtubeId: id, statut: "a_ingerer" })), reconciled: false };
  } else {
    // Fusionne d'éventuels nouveaux ids passés en argument.
    for (const id of youtubeIds) if (!manifest.videos.some((v) => v.youtubeId === id)) manifest.videos.push({ youtubeId: id, statut: "a_ingerer" });
  }
  saveManifest(manifest);

  let totalClaims = 0;
  let totalProposed = 0;
  let totalRejected = 0;

  for (const entry of manifest.videos) {
    if (entry.statut === "extraite" || entry.statut === "sans_transcript") {
      log(`= ${entry.youtubeId} (${entry.statut}) — saut`);
      totalClaims += entry.claims ?? 0;
      continue;
    }
    log(`• ${entry.youtubeId}`);
    try {
      const updated = await ingestVideo(store, entry.youtubeId, deps, opts);
      Object.assign(entry, updated);
      totalClaims += updated.claims ?? 0;
      totalRejected += updated.rejected ?? 0;
      totalProposed += (updated.claims ?? 0) + (updated.rejected ?? 0);
    } catch (e) {
      log(`  ✗ ${entry.youtubeId} échec : ${e instanceof Error ? e.message : String(e)}`);
    }
    saveManifest(manifest); // reprise après CHAQUE vidéo
  }

  // Passe de réconciliation GLOBALE quand toutes les vidéos exploitables sont extraites.
  const pending = manifest.videos.filter((v) => v.statut !== "extraite" && v.statut !== "sans_transcript");
  let reconcile: ReconcileResult | undefined;
  if (pending.length === 0) {
    log(`\n⚖  Réconciliation globale du corpus…`);
    reconcile = await reconcileCorpus(store, { dispatch: deps.dispatch, embed: deps.embed ? (t) => deps.embed!(t) : undefined }, { seuil: opts.seuil });
    manifest.reconciled = true;
    // marque les vidéos comme réconciliées
    for (const v of manifest.videos) if (v.statut === "extraite") store.getVideoByYoutubeId(v.youtubeId) && store.updateVideoStatut(store.getVideoByYoutubeId(v.youtubeId)!.id, "reconciliee");
    saveManifest(manifest);
    log(
      `   clusters=${reconcile.clusters} jugés=${reconcile.judged} muet=${reconcile.judgeSilent} (retry-OK=${reconcile.judgeRetried}) — ` +
        `consensus=${reconcile.verdicts.consensus} conditionnel=${reconcile.verdicts.conditionnel} desaccord=${reconcile.verdicts.desaccord} isole=${reconcile.verdicts.isole}`,
    );
  } else {
    log(`\n(réconciliation reportée : ${pending.length} vidéo(s) restante(s))`);
  }

  store.close();
  const rejectRate = totalProposed > 0 ? Math.round((totalRejected / totalProposed) * 100) : 0;
  return { manifest, reconcile, totalClaims, totalProposed, totalRejected, rejectRate };
}

// ── CLI ──────────────────────────────────────────────────────────────────────

function parseArgs(argv: string[]): { slug: string; ids: string[] } {
  let slug = "agentic-harness";
  const ids: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--corpus") slug = argv[++i] ?? slug;
    else ids.push(argv[i]);
  }
  return { slug, ids };
}

// Le corpus pilote d'É4 (3 vidéos réelles, transcripts déjà en cache).
const DEFAULT_CORPUS: Record<string, string[]> = {
  "agentic-harness": ["RaFC_oRBwF0", "c8bE0cj7vHY", "mQfTdNVCOB0"],
};

async function main(): Promise<void> {
  const { slug, ids } = parseArgs(process.argv.slice(2));
  const videoIds = ids.length > 0 ? ids : DEFAULT_CORPUS[slug] ?? [];
  if (videoIds.length === 0) {
    console.error("Usage: npx tsx src/run-savoir.ts --corpus <slug> <videoIdOrUrl...>");
    process.exit(1);
  }
  console.log(`[run-savoir] corpus="${slug}" — ${videoIds.length} vidéo(s). Gate SAVOIR_RUNNER=${flag("SAVOIR_RUNNER") ? "on" : "off (invocation CLI explicite)"}`);

  const deps: RunnerDeps = {
    fetch: (id) => fetchTranscript(id, { run: realRunner, corpus: slug }),
    ask: glmAsk,
    embed: safeEmbed,
    dispatch,
    log: (m) => console.log(m),
  };

  const t0 = Date.now();
  const r = await ingestCorpus(slug, videoIds, deps);
  const mins = ((Date.now() - t0) / 60000).toFixed(1);
  console.log(
    `\n[run-savoir] TERMINÉ en ${mins} min — claims total=${r.totalClaims}, rejet global=${r.rejectRate}% ` +
      `${r.reconcile ? `| verdicts : consensus=${r.reconcile.verdicts.consensus} conditionnel=${r.reconcile.verdicts.conditionnel} desaccord=${r.reconcile.verdicts.desaccord} isole=${r.reconcile.verdicts.isole}` : "(réconciliation reportée)"}`,
  );
  if (r.rejectRate > 25) console.warn(`⚠ GATE DE DÉCISION (D4) : taux de rejet global ${r.rejectRate}% > 25% — inscrire la mesure dans limites.md, ne pas industrialiser É5-É7 tel quel.`);
}

// Lancé en CLI seulement (pas à l'import — le test importe les fonctions).
const isDirect = process.argv[1] && /run-savoir\.(ts|js)$/.test(process.argv[1].replace(/\\/g, "/"));
if (isDirect) {
  main().catch((e) => {
    console.error("Erreur inattendue:", e);
    process.exit(1);
  });
}
