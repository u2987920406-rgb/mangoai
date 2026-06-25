// Tests des routes Ollama (#162 « Atelier des cerveaux »).
// Déterministe, zéro réseau : le `fetch` est injecté (mock). On vérifie surtout la
// VALIDATION du nom (anti-injection) et la ROBUSTESSE (Ollama down → {ok:false} sans
// throw). Le pull SSE est de la glue réseau → prouvé live, pas ici.

import {
  validModelName, fetchOllamaModels, fetchOllamaCaps, type OllamaDeps,
} from "./ollama-routes.js";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

// Petit faux fetch : renvoie une Response-like minimale.
function mockFetch(impl: (url: string, init?: RequestInit) => { ok: boolean; status?: number; json: () => unknown }): OllamaDeps["fetch"] {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const r = impl(url, init);
    return {
      ok: r.ok,
      status: r.status ?? (r.ok ? 200 : 500),
      json: async () => r.json(),
    } as Response;
  }) as OllamaDeps["fetch"];
}

async function run() {
  console.log("\n[1] validModelName — accepte les vrais noms, rejette l'injection");
  {
    check("qwen3-vl:8b accepté", validModelName("qwen3-vl:8b"));
    check("qwen3.5:cloud accepté", validModelName("qwen3.5:cloud"));
    check("scorpion7slayer/GLM-4.6V-Flash:latest accepté", validModelName("scorpion7slayer/GLM-4.6V-Flash:latest"));
    check("nom avec espace rejeté", !validModelName("evil model"));
    check("point-virgule rejeté", !validModelName("a;rm -rf"));
    check("traversée .. rejetée (présence d'un /)… mais '..' seul ok-format → on rejette via espace/charset", !validModelName("a b/..; rm"));
    check("chaîne vide rejetée", !validModelName(""));
    check("non-string rejeté", !validModelName(42 as unknown));
    check("> 200 chars rejeté", !validModelName("a".repeat(201)));
  }

  console.log("\n[2] fetchOllamaModels — liste + robustesse");
  {
    const okDeps: OllamaDeps = {
      fetch: mockFetch((url) => {
        check("appelle /api/tags", url.endsWith("/api/tags"));
        return { ok: true, json: () => ({ models: [
          { name: "qwen3-vl:8b", size: 8_800_000_000, details: { family: "qwen3vl", parameter_size: "8.8B" } },
          { name: "", size: 0 }, // ligne sans nom → filtrée
        ] }) };
      }),
      url: "http://x",
    };
    const r = await fetchOllamaModels(okDeps);
    check("ok:true", r.ok);
    check("1 modèle (vide filtré)", r.models.length === 1);
    check("nom/famille/taille mappés", r.models[0]?.name === "qwen3-vl:8b" && r.models[0]?.family === "qwen3vl" && r.models[0]?.parameterSize === "8.8B");
  }
  {
    // Ollama répond en erreur HTTP → ok:false, jamais de throw.
    const r = await fetchOllamaModels({ fetch: mockFetch(() => ({ ok: false, status: 503, json: () => ({}) })), url: "http://x" });
    check("HTTP 503 → ok:false sans throw", !r.ok && r.models.length === 0 && !!r.error);
  }
  {
    // fetch lève (Ollama injoignable) → capté, ok:false.
    const throwing = (async () => { throw new Error("ECONNREFUSED"); }) as OllamaDeps["fetch"];
    const r = await fetchOllamaModels({ fetch: throwing, url: "http://x" });
    check("fetch qui lève → ok:false capté", !r.ok && r.error?.includes("ECONNREFUSED") === true);
  }

  console.log("\n[3] fetchOllamaCaps — capabilities (la garde)");
  {
    const r = await fetchOllamaCaps("qwen3-vl:8b", {
      fetch: mockFetch((url, init) => {
        check("appelle /api/show en POST", url.endsWith("/api/show") && init?.method === "POST");
        return { ok: true, json: () => ({ capabilities: ["vision", "tools", "thinking"], details: { family: "qwen3vl", parameter_size: "8.8B" } }) };
      }),
      url: "http://x",
    });
    check("ok:true + vision présent", r.ok && r.capabilities.includes("vision"));
  }
  {
    // Le piège GLM-4.6V : pas de capability vision.
    const r = await fetchOllamaCaps("scorpion7slayer/GLM-4.6V-Flash:latest", {
      fetch: mockFetch(() => ({ ok: true, json: () => ({ capabilities: ["tools", "thinking", "completion"] }) })),
      url: "http://x",
    });
    check("GLM-4.6V → PAS de vision (garde déclenchable)", r.ok && !r.capabilities.includes("vision"));
  }
  {
    const r = await fetchOllamaCaps("absent:404", { fetch: mockFetch(() => ({ ok: false, status: 404, json: () => ({}) })), url: "http://x" });
    check("modèle absent → ok:false, caps vides", !r.ok && r.capabilities.length === 0);
  }

  console.log(`\n${fail === 0 ? "✅" : "❌"} ollama-routes : ${pass} ok, ${fail} ko`);
  if (fail > 0) process.exit(1);
}

run().catch((e) => { console.error(e); process.exit(1); });
