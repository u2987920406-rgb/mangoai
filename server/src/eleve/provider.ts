// Socle provider de l'Élève + transport chat fin (extraits de eleve.ts, chantier
// archi #3). FEUILLE bas-niveau : ce module n'importe AUCUN autre sous-module
// eleve/ — il est importé transversalement par contract/escalade/relay.
import { resolveProfile } from "../models/profile.js";
import { type LLMProvider } from "../llm/llm-engine.js";
import { getBrain } from "../brain/brain-registry.js";
// T1 : la résolution d'endpoint openai-compat de l'Élève délègue au résolveur
// unique (famille 'eleve' — SANS LLM_OPENAI_URL/KEY, baseUrl ignoré pour les presets).
import { resolveEndpoint, normalizeCompletionsUrl } from "../llm/llm-endpoint.js";
// T4 : couche transport unique (mappers inclus).
import { ollamaChat, openAiChat } from "../llm/llm-transport.js";

export const OLLAMA = process.env.OLLAMA_URL ?? "http://localhost:11434";

// Provider de l'Élève (« Élève turbo », optionnel). Par défaut « ollama » = le
// modèle LOCAL ($0, souverain). En option « openai » = un endpoint compatible
// OpenAI (DeepSeek, Together, etc.) — plus puissant mais PAYANT et non local.
export function normalizeEleveProvider(raw?: string): "ollama" | "openai" {
  return (raw ?? "").trim().toLowerCase() === "openai" ? "openai" : "ollama";
}
// Tolère une base (".../v1") OU l'endpoint complet (".../chat/completions").
// T1 : adaptateur mince → normalisation partagée (byte-identique).
export function completionsUrl(base: string): string {
  return normalizeCompletionsUrl(base);
}

// Raf (2026-07-11) : « un SEUL endroit pour changer de modèle, sinon on se
// perd. » Réglages (Atelier des cerveaux → brain-registry.json → rôle `codeur`,
// SOURCE UNIQUE partagée avec globalFallback() dans brain-runtime.ts) pilote
// désormais CES QUATRE VARIABLES EN DIRECT, sans redémarrage du backend. `let`
// (pas `const`) : en ESM les imports sont des liaisons VIVANTES — un module qui
// fait `import { ELEVE_MODEL } from "./provider.js"` voit la valeur à jour dès
// que syncEleveFromBrainRegistry() la réassigne ici, sans rien changer chez lui.
// .env (ELEVE_MODEL/ELEVE_PROVIDER/ELEVE_API_URL/KEY) redevient un simple
// AMORÇAGE À FROID : valeur de secours si brain-registry.json est absent/vide
// (repli DEFAULT_REGISTRY.codeur dans brain-registry.ts), plus jamais la vérité
// une fois le registre présent.
export let ELEVE_MODEL = process.env.ELEVE_MODEL ?? "gemma4:12b";
// Partition de la famille du modèle Élève : prompt système, fichiers d'axiomes,
// caps et routage d'escalade viennent du PROFIL (server/src/models/). Le cœur
// reste agnostique ; un modèle non reconnu retombe sur GENERIC = comportement
// actuel exact. Profil par défaut (famille du modèle global ELEVE_MODEL). Sert
// de fallback quand runRelay est appelé sans opts.profile. Les surcharges par
// appel lisent callProfile = opts.profile ?? PROFILE (résolution locale dans runRelay).
export let PROFILE = resolveProfile(ELEVE_MODEL);
export let ELEVE_PROVIDER = normalizeEleveProvider(process.env.ELEVE_PROVIDER);
export let ELEVE_API_URL = process.env.ELEVE_API_URL ?? "https://api.deepseek.com/v1";
export let ELEVE_API_KEY = process.env.ELEVE_API_KEY?.trim() ?? "";
// Phase E2 — provider PAR APPEL (multi-cerveaux). Le provider de l'Élève n'est
// plus uniquement le global : chaque intention peut router vers SON cerveau (cloud
// openai-compat OU ollama local). Le défaut reste le global (réversibilité totale).
export let ELEVE_PROVIDER_DEFAULT: LLMProvider = ELEVE_PROVIDER === "openai" ? "openai" : "ollama";

/**
 * Relit `brain-registry.json` (rôle `codeur`) et réassigne ELEVE_MODEL/PROFILE/
 * ELEVE_PROVIDER/ELEVE_PROVIDER_DEFAULT/ELEVE_API_URL/ELEVE_API_KEY EN PLACE —
 * chaque importeur de ces bindings ESM voit la nouvelle valeur immédiatement.
 * Appelée (a) une fois au chargement du module (le registre prime sur .env dès
 * le boot) et (b) par la route PUT /api/brain-registry après chaque sauvegarde
 * de Réglages (effet immédiat, sans redémarrage). `codeur.model` vide (registre
 * neuf/corrompu) → on garde .env tel quel (repli intact, jamais de régression).
 */
export function syncEleveFromBrainRegistry(): void {
  const c = getBrain("codeur");
  const model = (c.model ?? "").trim();
  if (model) ELEVE_MODEL = model;
  PROFILE = resolveProfile(ELEVE_MODEL);
  // "codeur" peut porter n'importe quel LLMProvider (le registre est partagé avec
  // tous les rôles) ; l'Élève ne sait dispatcher que ollama/openai-compat — un
  // provider "claude" (ou autre) sur `codeur` n'est pas un usage prévu ici (le
  // Maître Claude a son propre mécanisme, eleve/escalade.ts) → on n'y touche pas.
  if (c.provider === "ollama") ELEVE_PROVIDER = "ollama";
  else if (c.provider && c.provider !== "claude") ELEVE_PROVIDER = "openai";
  ELEVE_PROVIDER_DEFAULT = ELEVE_PROVIDER === "openai" ? "openai" : "ollama";
  if (c.baseUrl) ELEVE_API_URL = c.baseUrl;
  if (c.apiKeyEnv) {
    const key = process.env[c.apiKeyEnv]?.trim();
    if (key) ELEVE_API_KEY = key;
  }
}
syncEleveFromBrainRegistry();
/** Un provider openai-compatible peut piloter la boucle agentique (function-calling). */
export function isOpenAICompat(p: LLMProvider): boolean {
  return p === "openai" || p === "deepseek" || p === "mistral" || p === "groq" || p === "litellm";
}
/** Endpoint custom (C1-P0) — le registre porte une base URL + le NOM de la
 * variable d'env qui tient la clé. On ne threade JAMAIS la valeur de la clé en
 * clair : seule cette fonction lit process.env[apiKeyEnv], au tout dernier moment. */
export interface EndpointOverride {
  baseUrl?: string;
  apiKeyEnv?: string;
}

/** Résout l'endpoint (url + clé) d'un provider openai-compat. Défaut = endpoint
 * Élève (ELEVE_API_URL/KEY, p.ex. Ollama Cloud) ; presets pour deepseek/mistral/groq/litellm.
 * `endpoint` (C1-P0, depuis le registre/le binding) PRIME sur le repli .env — mais
 * SEULEMENT là où ELEVE_API_URL/ELEVE_API_KEY intervenaient déjà. `endpoint` absent
 * (ou champs vides) → résolution STRICTEMENT identique à avant l'ajout de C1-P0. */
export function openAiEndpoint(provider: LLMProvider, endpoint?: EndpointOverride): { url: string; key: string } {
  // T1 : adaptateur mince → résolveur unique (famille 'eleve'). Byte-identique à
  // l'ancien code : repli ELEVE_API_URL/KEY (SANS LLM_OPENAI_*), baseUrl ignoré
  // pour les presets, url = endpoint complet (/chat/completions).
  return resolveEndpoint(provider, "eleve", endpoint);
}

// Timeout réseau de chaque appel Élève : un fetch qui pend (TCP half-open, cloud
// muet) ne déclenche AUCUN retry et gèle le tour — agentBusy jamais libéré, UI
// morte jusqu'au redémarrage du backend. Borne dure, configurable par env.
export const ELEVE_FETCH_TIMEOUT_MS = Math.max(30_000, Number(process.env.ELEVE_FETCH_TIMEOUT_MS ?? 180_000));

// ── Cerveau Élève par défaut : Gemma local via Ollama ──────────────────────────
// T4 : transport délégué à la brique partagée ollamaChat. Famille eleve = SANS
// keep_alive, SANS trim → byte-identique à l'ancien fetch inline.
export async function askEleveOllama(system: string, user: string, model?: string): Promise<string> {
  return ollamaChat(system, user, { baseUrl: OLLAMA, model: model ?? ELEVE_MODEL, timeoutMs: ELEVE_FETCH_TIMEOUT_MS });
}

// ── Cerveau Élève « turbo » : endpoint compatible OpenAI (DeepSeek, etc.) ──────
// Même contrat d'E/S (system + user → texte) que la version Ollama → la boucle
// de relais est INCHANGÉE. ⚠ Payant : la note n'est PAS captée dans les
// métriques (le tour Élève reste compté coût 0 ; seule l'escalade Claude l'est).
// T4 : transport délégué à openAiChat. Famille eleve = SANS max_tokens, SANS trim,
// libellé 'API Élève' → byte-identique. La vérif de clé (message spécifique) reste ici.
export async function askEleveOpenAI(system: string, user: string, model?: string, provider: LLMProvider = "openai", endpoint?: EndpointOverride): Promise<string> {
  const { url, key } = openAiEndpoint(provider, endpoint);
  if (!key) {
    throw new Error("Clé API Élève manquante (provider openai-compat) — ajoute ELEVE_API_KEY dans server/.env.");
  }
  return openAiChat(system, user, { url, key, model: model ?? ELEVE_MODEL, timeoutMs: ELEVE_FETCH_TIMEOUT_MS, errorLabel: "API Élève", trim: false });
}

// Aiguillage du cerveau Élève selon le provider. Défaut = global (.env) ; un appel
// peut router vers SON cerveau (Phase E2) : ollama local vs openai-compat cloud.
export async function askEleveDispatch(system: string, user: string, model?: string, provider: LLMProvider = ELEVE_PROVIDER_DEFAULT, endpoint?: EndpointOverride): Promise<string> {
  return provider === "ollama" ? askEleveOllama(system, user, model) : askEleveOpenAI(system, user, model, provider, endpoint);
}

// ── Tour CONVERSATIONNEL de l'Élève (modes Discuter / Planifier) ──────────────
// Hors de la boucle de relais : l'Élève répond en TEXTE, sans build ni contrat
// <mangoos>. Même cerveau (Ollama local OU cloud selon ELEVE_PROVIDER), mais on
// veut une réponse de conseil/plan, pas une construction. Modèle = ELEVE_MODEL
// (l'Élève actif), surchargeable par appel. Le system prompt (posture Discussion
// + contexte projet) est fourni par l'appelant (assembleSystemPrompt mode discuss).
export async function chatEleve(system: string, user: string, model?: string, provider?: LLMProvider, endpoint?: EndpointOverride): Promise<string> {
  return askEleveDispatch(system, user, model, provider ?? ELEVE_PROVIDER_DEFAULT, endpoint);
}
