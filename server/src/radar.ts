// Idea #60 — Weekly AI Radar: analysis layer on top of the raw veille feed.
// Fetches RSS items (via fetchVeilleItems from veille.ts), runs LLM relevance
// filtering for MangoOS, caches the result for 7 days, and exposes:
//   GET  /api/radar          → { items, generatedAt, stale }
//   POST /api/radar/refresh  → force-refresh the cache
import fs from "node:fs";
import path from "node:path";
import type { Express, Request, Response } from "express";
import { fetchVeilleItems } from "./veille.js";
import { resolveProvider } from "./llm/llm-engine.js";
import { getBrain } from "./kernel.js";
import { atomicWriteFileSync, dataDir } from "./safe-io.js";

// ── Types ─────────────────────────────────────────────────────────────────────

const VALID_CATEGORIES = ["modèle", "api", "outil", "prix", "autre"] as const;
type RadarCategory = (typeof VALID_CATEGORIES)[number];

export interface RadarItem {
  title: string;
  link: string;
  source: string;
  category: RadarCategory;
  relevant: boolean;
  summary: string;
  whyMango: string;
}

interface RadarCache {
  items: RadarItem[];
  generatedAt: string;
}

// ── Persistence ───────────────────────────────────────────────────────────────

const DATA_DIR = dataDir();
const CACHE_FILE = path.join(DATA_DIR, "radar.json");
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function loadCache(): RadarCache | null {
  try {
    return JSON.parse(fs.readFileSync(CACHE_FILE, "utf8")) as RadarCache;
  } catch {
    return null;
  }
}

function saveCache(data: RadarCache): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  atomicWriteFileSync(CACHE_FILE, JSON.stringify(data, null, 2));
}

function isCacheFresh(cache: RadarCache): boolean {
  try {
    const age = Date.now() - new Date(cache.generatedAt).getTime();
    return age < SEVEN_DAYS_MS;
  } catch {
    return false;
  }
}

// ── LLM analysis ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT =
  "You are an AI research analyst specializing in tools for AI-assisted local-first app builders. " +
  "MangoOS is a personal app-builder that uses Claude (via subscription) and local models (Ollama/Gemma). " +
  "Your task: analyze a list of AI news items and judge their relevance for MangoOS. " +
  "Respond ONLY with valid JSON — no markdown, no commentary outside the JSON object.";

/** Call the LLM to filter and categorize raw veille items. */
export async function analyzeRadar(
  items: Array<{ title: string; link: string; source: string }>
): Promise<string> {
  const itemsText = items
    .map((it, i) => `${i + 1}. [${it.source}] ${it.title} — ${it.link}`)
    .join("\n");

  const userPrompt = `Here are the latest AI news items:\n${itemsText}\n\n` +
    `For each item, assess its relevance for MangoOS (an AI app-builder that uses Claude + local Ollama models). ` +
    `Return ONLY this JSON:\n` +
    `{\n` +
    `  "items": [\n` +
    `    {\n` +
    `      "title": "...",\n` +
    `      "link": "...",\n` +
    `      "source": "...",\n` +
    `      "category": "modèle" | "api" | "outil" | "prix" | "autre",\n` +
    `      "relevant": true | false,\n` +
    `      "summary": "one sentence summarizing the news",\n` +
    `      "whyMango": "one sentence on why this matters for MangoOS (or empty if not relevant)"\n` +
    `    }\n` +
    `  ]\n` +
    `}`;

  return getBrain().complete(SYSTEM_PROMPT, userPrompt, {
    provider: resolveProvider(process.env.RADAR_PROVIDER, "claude"),
    maxTokens: 1500,
  });
}

// ── Parser (pure, exported for tests) ────────────────────────────────────────

/** Extract and normalize RadarItems from raw LLM output.
 *  - Extracts JSON via regex (handles markdown fences)
 *  - Normalizes category to one of the 5 valid values (else "autre")
 *  - Coerces `relevant` to boolean
 *  - Returns only items where relevant === true
 *  - Robust: non-JSON input → []
 */
export function parseRadar(raw: string): RadarItem[] {
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return [];

    const obj = JSON.parse(match[0]) as { items?: unknown[] };
    if (!Array.isArray(obj.items)) return [];

    const normalized: RadarItem[] = obj.items.map((it) => {
      const item = (it ?? {}) as Record<string, unknown>;
      const rawCat = typeof item.category === "string" ? item.category.toLowerCase().trim() : "";
      const category: RadarCategory = (VALID_CATEGORIES as readonly string[]).includes(rawCat)
        ? (rawCat as RadarCategory)
        : "autre";

      const relevant =
        item.relevant === true ||
        item.relevant === "true" ||
        item.relevant === 1;

      return {
        title: typeof item.title === "string" ? item.title : "",
        link: typeof item.link === "string" ? item.link : "",
        source: typeof item.source === "string" ? item.source : "",
        category,
        relevant: Boolean(relevant),
        summary: typeof item.summary === "string" ? item.summary : "",
        whyMango: typeof item.whyMango === "string" ? item.whyMango : "",
      };
    });

    return normalized.filter((it) => it.relevant === true);
  } catch {
    return [];
  }
}

// ── Main entry point ──────────────────────────────────────────────────────────

/** Return radar items, using the 7-day cache unless force=true.
 *  Best-effort: if analysis fails, returns last cache (or raw items as fallback). */
export async function getRadar(force = false): Promise<{
  items: RadarItem[];
  generatedAt: string;
  stale: boolean;
}> {
  const cache = loadCache();

  // Return fresh cache immediately
  if (cache && isCacheFresh(cache) && !force) {
    return { ...cache, stale: false };
  }

  // Attempt to refresh
  let rawItems: Array<{ title: string; link: string; source: string }> = [];
  try {
    rawItems = await fetchVeilleItems();
  } catch {
    // RSS fetch failed — fall back to cache or empty
    if (cache) return { ...cache, stale: true };
    return { items: [], generatedAt: new Date().toISOString(), stale: true };
  }

  if (rawItems.length === 0) {
    if (cache) return { ...cache, stale: true };
    const fallback: RadarCache = { items: [], generatedAt: new Date().toISOString() };
    return { ...fallback, stale: true };
  }

  let analyzed: RadarItem[] = [];
  try {
    const raw = await analyzeRadar(rawItems);
    analyzed = parseRadar(raw);
  } catch {
    // LLM failed — return last cache if available, otherwise raw items without analysis
    if (cache) return { ...cache, stale: true };
    // Minimal fallback: surface all raw items as "autre", unfiltered
    analyzed = rawItems.map((it) => ({
      ...it,
      category: "autre" as RadarCategory,
      relevant: true,
      summary: it.title,
      whyMango: "",
    }));
  }

  const newCache: RadarCache = {
    items: analyzed,
    generatedAt: new Date().toISOString(),
  };
  try {
    saveCache(newCache);
  } catch {
    /* best-effort persistence */
  }

  return { ...newCache, stale: false };
}

// ── Background weekly scheduler ───────────────────────────────────────────────

/** Tick every ~6 hours: pre-warm the cache if it's older than 7 days. */
function startRadarScheduler(): void {
  const tick = async () => {
    try {
      const cache = loadCache();
      if (cache && isCacheFresh(cache)) return; // still fresh, skip
      await getRadar(true);
    } catch {
      /* silent: scheduler must never crash the server */
    }
  };
  setInterval(() => {
    void tick();
  }, 6 * 60 * 60 * 1000); // 6 hours
}

// ── Routes ─────────────────────────────────────────────────────────────────────

export function registerRadarRoutes(app: Express): void {
  // GET /api/radar → { items, generatedAt, stale }
  app.get("/api/radar", async (_req: Request, res: Response) => {
    try {
      const data = await getRadar(false);
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // POST /api/radar/refresh → force re-analysis
  app.post("/api/radar/refresh", async (_req: Request, res: Response) => {
    try {
      const data = await getRadar(true);
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  startRadarScheduler();
}
