// Routes Ollama (#162 « Atelier des cerveaux ») — exposent l'Ollama LOCAL à l'UI :
//   GET    /api/ollama/models        → modèles installés (via /api/tags)
//   GET    /api/ollama/caps?name=…   → capabilities d'un modèle (via /api/show) — LA garde
//   POST   /api/ollama/pull {name}   → télécharge un modèle (SSE de progression)
//   DELETE /api/ollama/model?name=…  → supprime un modèle (via /api/delete)
//
// La garde de capacités vient de /api/show.capabilities (vision/tools/thinking…) :
// c'est exactement ce qui manquait à GLM-4.6V-Flash (HTTP 500 sur image). Le nom de
// modèle est TOUJOURS validé (anti-injection). On passe le nom en QUERY/BODY (pas en
// param de chemin) car il contient des `/` et `:` (ex. scorpion7slayer/GLM…:latest).
// Helpers purs-ish (fetch injectable) pour les tests ; pull/delete = glue réseau,
// prouvés live. Ne renvoie jamais 500 sur Ollama injoignable (→ { ok:false }).

import type { Express, Request, Response } from "express";

const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434";
const NAME_RE = /^[a-zA-Z0-9._/:-]+$/;

/** Nom de modèle Ollama acceptable (anti-injection). PUR. */
export function validModelName(s: unknown): s is string {
  return typeof s === "string" && s.length > 0 && s.length <= 200 && NAME_RE.test(s);
}

export interface OllamaModel {
  name: string;
  size: number;
  family: string;
  parameterSize: string;
}

export interface OllamaDeps {
  fetch: typeof fetch;
  url?: string;
}

const realDeps: OllamaDeps = { fetch: (...a: Parameters<typeof fetch>) => fetch(...a), url: OLLAMA_URL };

/** Liste les modèles locaux (via /api/tags). Ne lève jamais (Ollama down → ok:false). */
export async function fetchOllamaModels(deps: OllamaDeps = realDeps): Promise<{ ok: boolean; models: OllamaModel[]; error?: string }> {
  const base = deps.url ?? OLLAMA_URL;
  try {
    const r = await deps.fetch(`${base}/api/tags`);
    if (!r.ok) return { ok: false, models: [], error: `Ollama HTTP ${r.status}` };
    const data = (await r.json()) as { models?: Array<{ name?: string; size?: number; details?: { family?: string; parameter_size?: string } }> };
    const models = (data.models ?? [])
      .map((m) => ({
        name: String(m.name ?? ""),
        size: Number(m.size ?? 0),
        family: String(m.details?.family ?? ""),
        parameterSize: String(m.details?.parameter_size ?? ""),
      }))
      .filter((m) => m.name);
    return { ok: true, models };
  } catch (e) {
    return { ok: false, models: [], error: e instanceof Error ? e.message : String(e) };
  }
}

/** Capabilities d'un modèle (via /api/show). Ne lève jamais. */
export async function fetchOllamaCaps(
  name: string,
  deps: OllamaDeps = realDeps,
): Promise<{ ok: boolean; capabilities: string[]; family: string; parameterSize: string; error?: string }> {
  const base = deps.url ?? OLLAMA_URL;
  try {
    const r = await deps.fetch(`${base}/api/show`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: name }),
    });
    if (!r.ok) return { ok: false, capabilities: [], family: "", parameterSize: "", error: `Ollama HTTP ${r.status}` };
    const data = (await r.json()) as { capabilities?: unknown; details?: { family?: string; parameter_size?: string } };
    return {
      ok: true,
      capabilities: Array.isArray(data.capabilities) ? data.capabilities.map(String) : [],
      family: String(data.details?.family ?? ""),
      parameterSize: String(data.details?.parameter_size ?? ""),
    };
  } catch (e) {
    return { ok: false, capabilities: [], family: "", parameterSize: "", error: e instanceof Error ? e.message : String(e) };
  }
}

export function registerOllamaRoutes(app: Express): void {
  app.get("/api/ollama/models", async (_req: Request, res: Response) => {
    res.json(await fetchOllamaModels());
  });

  app.get("/api/ollama/caps", async (req: Request, res: Response) => {
    const name = String(req.query["name"] ?? "");
    if (!validModelName(name)) {
      res.status(400).json({ error: "Nom de modèle invalide." });
      return;
    }
    res.json(await fetchOllamaCaps(name));
  });

  // Télécharge un modèle — relaie le flux NDJSON d'Ollama en SSE de progression.
  app.post("/api/ollama/pull", async (req: Request, res: Response) => {
    const name = (req.body as { name?: unknown })?.name;
    if (!validModelName(name)) {
      res.status(400).json({ error: "Nom de modèle invalide." });
      return;
    }
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    const send = (obj: unknown) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
    try {
      const r = await fetch(`${OLLAMA_URL}/api/pull`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: name, stream: true }),
      });
      if (!r.ok || !r.body) {
        send({ error: `Ollama HTTP ${r.status}` });
        res.end();
        return;
      }
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          const t = line.trim();
          if (!t) continue;
          try {
            send(JSON.parse(t));
          } catch {
            /* ligne partielle/non-JSON : on saute */
          }
        }
      }
      send({ done: true });
    } catch (e) {
      send({ error: e instanceof Error ? e.message : String(e) });
    } finally {
      res.end();
    }
  });

  app.delete("/api/ollama/model", async (req: Request, res: Response) => {
    const name = String(req.query["name"] ?? "");
    if (!validModelName(name)) {
      res.status(400).json({ error: "Nom de modèle invalide." });
      return;
    }
    try {
      const r = await fetch(`${OLLAMA_URL}/api/delete`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: name }),
      });
      if (!r.ok) {
        res.status(502).json({ error: `Ollama HTTP ${r.status}` });
        return;
      }
      res.json({ ok: true });
    } catch (e) {
      res.status(502).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });
}
