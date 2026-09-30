// Repli de cerveau pour le MOTEUR RÉEL de l'Élève (audit dormant #32).
//
// Constat : `BRAIN_FALLBACK=on` était promu depuis le 2026-09-29 mais ne jouait que dans
// `dispatch()` (brain-dispatch.ts) — et seul le rôle `vision` déclarait une chaîne. Le moteur
// agentique de l'Élève (rôle `codeur`) appelle `elevePost` en direct : quand l'API tombait
// (cause n°1 des 14 runs en erreur sur 37, flags.ts), aucun repli ne jouait. Ici le MÊME
// registre (`brain.fallback`, même flag) est honoré au niveau du transport agentique.
//
// Contrat : n'intervient QUE sur une erreur de DISPONIBILITÉ (réseau, timeout, 408/429/5xx,
// « terminated », réponse vide) — jamais sur un 4xx de requête (auth, contexte trop long : le
// repli paierait un second appel voué à l'échec). Chaîne bornée (MAX_FALLBACK_CHAIN), première
// réussite gagne, chaîne épuisée → l'erreur ORIGINALE est relancée (comportement inchangé).
// Seuls les providers qui pilotent des outils (openai-compat / ollama) sont des cibles valides.
import { flag } from "../flags.js";
import { getBrain, type BrainFallback } from "../brain/brain-registry.js";
import { type PostFn } from "../eleve-runtime.js";
import { type LLMProvider } from "../llm/llm-engine.js";
import { elevePost, supportsTools } from "./contract.js";

const AVAILABILITY = /HTTP (408|425|429|5\d\d)\b|fetch failed|timed? ?out|d[ée]lai|abort|terminated|ECONN|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|socket|network|r[ée]ponse [ÉE]l[èe]ve vide/i;

/** L'erreur est-elle un problème de DISPONIBILITÉ du cerveau (donc rejouable ailleurs) ? PUR. */
export function isAvailabilityError(err: unknown): boolean {
  const msg = err instanceof Error ? `${err.name} ${err.message}` : String(err);
  return AVAILABILITY.test(msg);
}

export interface PostFallbackDeps {
  /** Chaîne de repli du rôle (défaut : registre des cerveaux). */
  chain?: () => BrainFallback[];
  /** Fabrique du transport d'une cible (défaut : elevePost). */
  makePost?: (model: string | undefined, provider: LLMProvider, endpoint: { baseUrl?: string; apiKeyEnv?: string; timeoutMs?: number }) => PostFn;
  /** Le repli est-il armé ? (défaut : flag BRAIN_FALLBACK). */
  enabled?: () => boolean;
  warn?: (s: string) => void;
}

/** Enrobe le transport principal : erreur de disponibilité → cibles de repli du rôle `role`. */
export function withBrainFallback(primary: PostFn, model: string | undefined, role: "codeur", deps: PostFallbackDeps = {}): PostFn {
  const enabled = deps.enabled ?? (() => flag("BRAIN_FALLBACK"));
  const chainOf = deps.chain ?? (() => getBrain(role).fallback ?? []);
  const make = deps.makePost ?? ((m, p, e) => elevePost(m, p, e));
  const warn = deps.warn ?? ((s: string) => console.warn(s));
  return async (messages, tools) => {
    try {
      return await primary(messages, tools);
    } catch (err) {
      if (!isAvailabilityError(err) || !enabled()) throw err;
      let chain: BrainFallback[] = [];
      try { chain = chainOf(); } catch { chain = []; }
      for (const fb of chain) {
        if (!supportsTools(fb.provider)) continue; // ex. claude : pas de function-calling ici
        try {
          const out = await make(fb.model ?? model, fb.provider, { baseUrl: fb.baseUrl, apiKeyEnv: fb.apiKeyEnv, timeoutMs: fb.timeoutMs })(messages, tools);
          warn(`[brain-fallback] ${role}: primaire indisponible (${(err as Error).message.slice(0, 80)}) → repli ${fb.provider}/${fb.model ?? model ?? "?"} réussi`);
          return out;
        } catch {
          /* cible suivante */
        }
      }
      throw err; // chaîne vide/épuisée : l'erreur d'origine, comportement historique
    }
  };
}
