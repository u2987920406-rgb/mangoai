// Tests de la sérialisation GPU (gpu-serialize). Ollama SIMULÉ via fetchImpl mock — aucun GPU.
// On exerce : listLoadedModels (/api/ps), unloadModel (/api/generate keep_alive:0),
// freeOllamaVram (décharge tout, opt-out FLUX_SERIALIZE_GPU=off, ne lève jamais).

import {
  listLoadedModels,
  unloadModel,
  freeOllamaVram,
  type GpuSerializeDeps,
} from "./gpu-serialize.js";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.log(`  ✗ ${label}`);
  }
}

function resp(opts: { ok?: boolean; status?: number; json?: unknown }): Response {
  return {
    ok: opts.ok ?? true,
    status: opts.status ?? 200,
    json: async () => opts.json,
    text: async () => "",
  } as unknown as Response;
}

interface Call {
  url: string;
  method: string;
  body?: string;
}

/** Fake Ollama : /api/ps → modèles chargés ; /api/generate → ok. Journalise les appels. */
function fakeOllama(over: { loaded?: { name?: string; model?: string }[]; psOk?: boolean; unloadOk?: boolean } = {}): {
  deps: GpuSerializeDeps;
  calls: Call[];
} {
  const calls: Call[] = [];
  const deps: GpuSerializeDeps = {
    fetchImpl: (async (url: string, init?: { method?: string; body?: string }) => {
      const u = String(url);
      calls.push({ url: u, method: init?.method ?? "GET", body: init?.body });
      if (u.includes("/api/ps")) {
        if (over.psOk === false) return resp({ ok: false, status: 500 });
        return resp({ json: { models: over.loaded ?? [] } });
      }
      if (u.includes("/api/generate")) {
        return over.unloadOk === false ? resp({ ok: false, status: 500 }) : resp({ json: { done: true } });
      }
      return resp({ ok: false, status: 404 });
    }) as unknown as typeof fetch,
    log: () => {},
  };
  return { deps, calls };
}

async function main() {
  const savedGate = process.env.FLUX_SERIALIZE_GPU;

  // ── listLoadedModels ────────────────────────────────────────────────────────
  console.log("\n[1] listLoadedModels — lit /api/ps et dédoublonne");
  {
    const { deps } = fakeOllama({ loaded: [{ name: "qwen3-vl:8b" }, { name: "gemma4:12b" }, { name: "qwen3-vl:8b" }] });
    const m = await listLoadedModels(deps);
    check("retourne les 2 modèles uniques", m.length === 2 && m.includes("qwen3-vl:8b") && m.includes("gemma4:12b"));
  }
  {
    const { deps } = fakeOllama({ loaded: [{ model: "fallback:latest" }] });
    const m = await listLoadedModels(deps);
    check("retombe sur le champ `model` si `name` absent", m.length === 1 && m[0] === "fallback:latest");
  }
  {
    const { deps } = fakeOllama({ psOk: false });
    const m = await listLoadedModels(deps);
    check("HTTP KO → [] (ne lève jamais)", Array.isArray(m) && m.length === 0);
  }
  {
    const deps: GpuSerializeDeps = {
      fetchImpl: (async () => {
        throw new Error("réseau coupé");
      }) as unknown as typeof fetch,
    };
    const m = await listLoadedModels(deps);
    check("fetch qui lève → [] (ne lève jamais)", Array.isArray(m) && m.length === 0);
  }

  // ── unloadModel ─────────────────────────────────────────────────────────────
  console.log("\n[2] unloadModel — POST /api/generate keep_alive:0");
  {
    const { deps, calls } = fakeOllama();
    const ok = await unloadModel("qwen3-vl:8b", deps);
    const c = calls.find((x) => x.url.includes("/api/generate"));
    const bodyOk = !!c && c.method === "POST" && !!c.body && JSON.parse(c.body).keep_alive === 0 && JSON.parse(c.body).model === "qwen3-vl:8b";
    check("appelle /api/generate en POST avec keep_alive:0", ok && bodyOk);
  }
  {
    const { deps } = fakeOllama({ unloadOk: false });
    const ok = await unloadModel("x", deps);
    check("HTTP KO → false (ne lève jamais)", ok === false);
  }

  // ── freeOllamaVram ──────────────────────────────────────────────────────────
  console.log("\n[3] freeOllamaVram — décharge tous les modèles chargés");
  {
    delete process.env.FLUX_SERIALIZE_GPU;
    const { deps, calls } = fakeOllama({ loaded: [{ name: "qwen3-vl:8b" }, { name: "gemma4:12b" }] });
    const r = await freeOllamaVram(deps);
    const unloads = calls.filter((x) => x.url.includes("/api/generate"));
    check("décharge les 2 modèles", r.unloaded.length === 2 && unloads.length === 2);
    check("skipped=false quand actif", r.skipped === false);
  }
  {
    delete process.env.FLUX_SERIALIZE_GPU;
    const { deps, calls } = fakeOllama({ loaded: [] });
    const r = await freeOllamaVram(deps);
    const unloads = calls.filter((x) => x.url.includes("/api/generate"));
    check("VRAM déjà vide → aucun déchargement", r.unloaded.length === 0 && unloads.length === 0 && r.skipped === false);
  }
  {
    process.env.FLUX_SERIALIZE_GPU = "off";
    const { deps, calls } = fakeOllama({ loaded: [{ name: "qwen3-vl:8b" }] });
    const r = await freeOllamaVram(deps);
    check("opt-out FLUX_SERIALIZE_GPU=off → skipped, ne touche à rien", r.skipped === true && r.unloaded.length === 0 && calls.length === 0);
  }
  {
    delete process.env.FLUX_SERIALIZE_GPU;
    const { deps } = fakeOllama({ loaded: [{ name: "a" }, { name: "b" }], unloadOk: false });
    const r = await freeOllamaVram(deps);
    check("déchargement qui échoue → unloaded vide, ne lève jamais", r.unloaded.length === 0 && r.skipped === false);
  }

  if (savedGate === undefined) delete process.env.FLUX_SERIALIZE_GPU;
  else process.env.FLUX_SERIALIZE_GPU = savedGate;

  console.log(`\n${fail === 0 ? "✅" : "❌"} gpu-serialize : ${pass} pass, ${fail} fail`);
  if (fail > 0) process.exit(1);
}

void main();
