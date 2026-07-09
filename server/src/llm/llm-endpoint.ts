// Résolution d'endpoint openai-compat UNIQUE (chantier #2, tranche T1).
//
// MangoOS avait DEUX chaînes de repli d'endpoint parallèles et NON byte-identiques :
//   • famille 'engine' (llm-engine.ts : askOpenAI / resolvePresetEndpoint /
//     resolveLitellmEndpoint) — INCLUT LLM_OPENAI_URL / LLM_OPENAI_KEY dans ses
//     replis, et APPLIQUE le baseUrl override aux presets deepseek/mistral/groq.
//   • famille 'eleve' (eleve.ts : openAiEndpoint) — N'INCLUT PAS LLM_OPENAI_URL /
//     LLM_OPENAI_KEY, et IGNORE le baseUrl override pour les presets.
//
// `resolveEndpoint(provider, family, overrides)` est le SUR-ENSEMBLE STRICT des
// deux : le paramètre `family` sélectionne EXACTEMENT la divergence. C'est le
// point de risque #1 du plan — la divergence est désormais explicite et ne peut
// plus dériver en silence. Sortie byte-identique aux deux chaînes historiques
// (prouvé par l'oracle test-llm-endpoint-oracle + test-llm-engine + test-brain-endpoints).
//
// IMPORTANT — forme de l'URL retournée (préservée famille par famille) :
//   • family 'engine' → url = la BASE telle que le transport askOpenAI la reçoit
//     (brute pour les presets/openai, .trim() pour litellm), SANS /chat/completions :
//     askOpenAI applique la normalisation ensuite. (test-llm-engine fige cette base.)
//   • family 'eleve'  → url = l'endpoint COMPLET (…/chat/completions), car le
//     transport askEleveOpenAI l'utilise tel quel. (test-brain-endpoints le fige.)
// La clé n'est JAMAIS threadée en clair : `apiKeyEnv` est un NOM de variable, lu
// via process.env AU DERNIER MOMENT ici, jamais stocké ni logué ailleurs.

import type { LLMProvider } from "./llm-engine.js";

/** Preset OpenAI-compat (base URL, modèle par défaut, nom de la variable de clé). */
export interface ProviderPreset {
  baseURL: string;
  defaultModel: string;
  apiKeyEnv: string;
}

/** Presets OpenAI-compat pour deepseek / mistral / groq. Source unique de vérité
 *  (llm-engine ré-exporte cette constante — l'API publique reste inchangée). */
export const PROVIDER_PRESETS: Record<"deepseek" | "mistral" | "groq", ProviderPreset> = {
  deepseek: {
    baseURL: "https://api.deepseek.com/v1",
    defaultModel: "deepseek-chat",
    apiKeyEnv: "DEEPSEEK_API_KEY",
  },
  mistral: {
    baseURL: "https://api.mistral.ai/v1",
    defaultModel: "mistral-large-latest",
    apiKeyEnv: "MISTRAL_API_KEY",
  },
  groq: {
    baseURL: "https://api.groq.com/openai/v1",
    defaultModel: "llama-3.3-70b-versatile",
    apiKeyEnv: "GROQ_API_KEY",
  },
};

/** Override d'endpoint (registre / binding) : base URL + NOM de la variable d'env
 *  qui porte la clé. Jamais la valeur de la clé. */
export interface EndpointOverrides {
  baseUrl?: string;
  apiKeyEnv?: string;
}

/** Famille de résolution — sélectionne la divergence historique préservée. */
export type EndpointFamily = "engine" | "eleve";

/** Normalise une base openai-compat en URL /chat/completions. Tolère une base
 *  (".../v1") OU l'endpoint déjà complet (".../chat/completions"). Byte-identique
 *  à l'ancien eleve.completionsUrl ET à la normalisation inline d'askOpenAI. */
export function normalizeCompletionsUrl(base: string): string {
  const b = (base ?? "").trim().replace(/\/+$/, "");
  return b.endsWith("/chat/completions") ? b : `${b}/chat/completions`;
}

/** Résout la clé via un NOM de variable d'env, au dernier moment. Renvoie '' si
 *  absente (jamais d'exception ici — l'appelant décide de lever). */
function overrideKeyFrom(apiKeyEnv?: string): string {
  return apiKeyEnv ? (process.env[apiKeyEnv] ?? "").trim() : "";
}

// ── Famille 'engine' — reproduit à l'octet resolvePresetEndpoint /
//    resolveLitellmEndpoint / le repli inline d'askLLM+askOpenAI. Inclut
//    LLM_OPENAI_URL / LLM_OPENAI_KEY. url = base BRUTE (askOpenAI normalise). ──
function resolveEngine(provider: LLMProvider, overrides: EndpointOverrides): { url: string; key: string } {
  if (provider === "deepseek" || provider === "mistral" || provider === "groq") {
    const preset = PROVIDER_PRESETS[provider];
    const url = overrides.baseUrl ?? preset.baseURL;
    const key = overrideKeyFrom(overrides.apiKeyEnv)
      || (process.env[preset.apiKeyEnv] ?? process.env.LLM_OPENAI_KEY ?? process.env.ELEVE_API_KEY ?? "").trim();
    return { url, key };
  }
  if (provider === "litellm") {
    const url = (overrides.baseUrl ?? process.env.LITELLM_BASE_URL ?? "http://localhost:4000/v1").trim();
    const key = overrideKeyFrom(overrides.apiKeyEnv) || (process.env.LITELLM_API_KEY ?? "sk-litellm-local").trim();
    return { url, key };
  }
  // 'openai' générique (et défaut) : LLM_OPENAI_URL/KEY dans la chaîne — propre
  // à la famille engine. url = base brute ; askOpenAI applique .trim()+completions.
  const url = overrides.baseUrl ?? process.env.LLM_OPENAI_URL ?? process.env.ELEVE_API_URL ?? "https://api.deepseek.com/v1";
  const ovKey = overrides.apiKeyEnv ? (overrideKeyFrom(overrides.apiKeyEnv) || undefined) : undefined;
  const key = (ovKey ?? process.env.LLM_OPENAI_KEY ?? process.env.ELEVE_API_KEY ?? "").trim();
  return { url, key };
}

// ── Famille 'eleve' — reproduit à l'octet eleve.openAiEndpoint. N'inclut PAS
//    LLM_OPENAI_URL/KEY ; IGNORE le baseUrl override pour les presets ; url =
//    endpoint COMPLET (askEleveOpenAI l'utilise tel quel). ─────────────────────
function resolveEleve(provider: LLMProvider, overrides: EndpointOverrides): { url: string; key: string } {
  const eleveApiUrl = process.env.ELEVE_API_URL ?? "https://api.deepseek.com/v1";
  const eleveApiKey = process.env.ELEVE_API_KEY?.trim() ?? "";
  const fallbackUrl = overrides.baseUrl?.trim() || eleveApiUrl;
  const fallbackKey = (overrides.apiKeyEnv ? process.env[overrides.apiKeyEnv] : undefined)?.trim() || eleveApiKey;
  if (provider === "deepseek" || provider === "mistral" || provider === "groq") {
    const p = PROVIDER_PRESETS[provider];
    return { url: normalizeCompletionsUrl(p.baseURL), key: (process.env[p.apiKeyEnv] ?? fallbackKey).trim() };
  }
  if (provider === "litellm") {
    return {
      url: normalizeCompletionsUrl(process.env.LITELLM_BASE_URL ?? "http://localhost:4000/v1"),
      key: (process.env.LITELLM_API_KEY ?? "sk-litellm-local").trim(),
    };
  }
  // "openai" générique (inclut Ollama Cloud) → endpoint Élève, ou override si fourni.
  return { url: normalizeCompletionsUrl(fallbackUrl), key: fallbackKey };
}

/** Résolveur d'endpoint openai-compat UNIQUE. `family` sélectionne la chaîne de
 *  repli historique EXACTE (voir en-tête de fichier). Sortie byte-identique aux
 *  deux résolveurs d'origine — c'est un pur refactor de plomberie. */
export function resolveEndpoint(
  provider: LLMProvider,
  family: EndpointFamily,
  overrides: EndpointOverrides = {},
): { url: string; key: string } {
  return family === "engine" ? resolveEngine(provider, overrides) : resolveEleve(provider, overrides);
}
