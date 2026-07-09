// MangoOS Kernel — fondation de l'écosystème d'agents.
//
// Ce fichier pose le NOYAU de MangoOS, conçu pour durer 10 ans (voir
// `fondation.md` à la racine). Premier pilier livré ici : le BRAIN ADAPTER.
//
// ── Brain Adapter (le HAL de MangoOS) ───────────────────────────────────────
// Le LLM n'est PAS une dépendance câblée : c'est un composant remplaçable.
// MangoOS ne sait pas quel cerveau il utilise — il parle à un `MangosBrain`
// qui expose toujours la même interface. Aujourd'hui Claude (abonnement, $0),
// demain Qwen 72B local, après-demain un modèle fine-tuné. Zéro changement
// dans le reste du système : on change une variable d'env.
//
// Le Brain Adapter ENVELOPPE `llm-engine.ts` (la porte d'entrée unique déjà
// mature : 7 providers dont 'litellm' = proxy OpenAI-compat vers 100+ modèles).
// Il n'en duplique rien — il offre une façade objet propre, swappable et
// injectable (pour des tests déterministes sans réseau).
//
// Piliers du Kernel encore à venir (cf. fondation.md) : Event Bus (A2A),
// Blackboard (SQLite-vec + mutex), MCP, OpenTelemetry. Ils s'ajouteront ici
// sans toucher au Brain Adapter.

import {
  askLLM,
  resolveProvider,
  type LLMProvider,
  type AskLLMOptions,
} from './llm/llm-engine.js'
import { getTracer, type KernelTracer } from './kernel/kernel-trace.js'
import { flag } from './flags.js'

// ── Le contrat universel du cerveau ──────────────────────────────────────────
// Tout ce que MangoOS demande à un LLM passe par cette interface. Rien d'autre.
export interface MangosBrain {
  /** Provider actif (claude / ollama / litellm / …). */
  readonly provider: LLMProvider
  /** Modèle actif, ou '' si on laisse llm-engine choisir son défaut. */
  readonly model: string
  /** (system, user) → texte. Lève si le provider échoue ; l'appelant décide
   * du fallback. Exception étroite (C2-P1) : sous le gate BRAIN_FALLBACK ET un
   * repli configuré (BRAIN_FALLBACK_PROVIDER), UN essai de repli est tenté ;
   * s'il échoue aussi, l'erreur ORIGINALE du principal est relevée — le contrat
   * « lève, l'appelant décide » reste vrai dans tous les cas terminaux. */
  complete(system: string, user: string, opts?: BrainCompleteOptions): Promise<string>
  /** Étiquette lisible pour logs / OpenTelemetry / UI. */
  describe(): string
}

export interface BrainCompleteOptions {
  /** Surcharge ponctuelle du PROVIDER pour cet appel (ex. un juge sur claude,
   * un résumé sur ollama). Préserve le routage par feature : chaque appel garde
   * son `resolveProvider(<FEATURE>_PROVIDER)`. Absent → provider du cerveau. */
  provider?: LLMProvider
  /** Surcharge ponctuelle du modèle pour cet appel. */
  model?: string
  maxTokens?: number
  timeoutMs?: number
}

export interface BrainConfig {
  /** Provider forcé. Défaut : lu depuis BRAIN_PROVIDER, sinon 'claude'. */
  provider?: LLMProvider
  /** Modèle par défaut du cerveau. Vide ('') = défaut de llm-engine. */
  model?: string
  maxTokens?: number
  timeoutMs?: number
}

// ── Injection de dépendance (pattern maison : cerveau injectable pour tests) ──
// Par défaut on tape `askLLM` (réseau réel). Les tests fournissent un faux
// `ask` pour valider le routage sans aucun appel réseau.
export interface BrainDeps {
  ask?: (system: string, user: string, opts?: AskLLMOptions) => Promise<string>
  /** Tracer pour envelopper chaque complete() dans un span (observabilité sur le
   * Bus). Absent → aucun traçage (createBrain reste pur/testable). Le singleton
   * `getBrain()` l'active avec `getTracer()`. */
  tracer?: KernelTracer
}

/** Résout la config du cerveau depuis l'environnement (BRAIN_PROVIDER /
 * BRAIN_MODEL). Bornée aux providers valides via `resolveProvider`. */
export function resolveBrainConfig(env: NodeJS.ProcessEnv = process.env): {
  provider: LLMProvider
  model: string
} {
  return {
    provider: resolveProvider(env.BRAIN_PROVIDER),
    model: (env.BRAIN_MODEL ?? '').trim(),
  }
}

/** Résout le repli inter-providers du cerveau depuis l'environnement
 * (BRAIN_FALLBACK_PROVIDER / BRAIN_FALLBACK_MODEL). Contrairement au principal,
 * l'ABSENCE de BRAIN_FALLBACK_PROVIDER signifie explicitement « pas de repli »
 * (jamais de défaut implicite via LLM_PROVIDER) — on ne veut PAS qu'un repli
 * apparaisse tout seul parce qu'une variable globale traîne. */
export function resolveBrainFallbackConfig(
  env: NodeJS.ProcessEnv = process.env,
): { provider: LLMProvider; model: string } | null {
  const raw = (env.BRAIN_FALLBACK_PROVIDER ?? '').trim()
  if (!raw) return null
  return {
    provider: resolveProvider(raw),
    model: (env.BRAIN_FALLBACK_MODEL ?? '').trim(),
  }
}

/** Construit un cerveau. `config` surcharge l'environnement ; `deps` permet
 * d'injecter un faux `ask` (tests). */
export function createBrain(config: BrainConfig = {}, deps: BrainDeps = {}): MangosBrain {
  const ask = deps.ask ?? askLLM
  const tracer = deps.tracer
  const base = resolveBrainConfig()
  const provider = config.provider ?? base.provider
  const model = (config.model ?? base.model).trim()
  const maxTokens = config.maxTokens
  const timeoutMs = config.timeoutMs
  // Repli inter-providers (C2-P1) : résolu UNE fois à la construction, comme le
  // reste de la config — pas de défaut implicite (voir resolveBrainFallbackConfig).
  const rawFallback = resolveBrainFallbackConfig()
  // (Un, 2026-07-03) U3 — rideau de fer BRAIN_LOCAL_ONLY ignoré par ce repli : le
  // flag ne gardait jusqu'ici QUE dispatch() (brain-runtime.ts), pas ce chemin
  // Kernel direct. Sous BRAIN_LOCAL_ONLY, un repli non-ollama est IGNORÉ (jamais
  // tenté) — dispatch() reste la garde PRINCIPALE, ceci ferme juste le trou.
  // Résolu UNE fois ici, comme le reste : pas de re-check à chaque complete().
  const localOnly = flag('BRAIN_LOCAL_ONLY')
  if (localOnly && rawFallback && rawFallback.provider !== 'ollama') {
    console.warn(`[kernel-fallback] repli ${rawFallback.provider} REFUSÉ (BRAIN_LOCAL_ONLY)`)
  }
  // Avertissement seul (non-bloquant) si le cerveau PRINCIPAL n'est pas non plus
  // ollama sous ce flag — dispatch() porte la garde qui bloque réellement ce cas.
  if (localOnly && provider !== 'ollama') {
    console.warn(`[kernel-fallback] cerveau principal ${provider} non-ollama sous BRAIN_LOCAL_ONLY (garde principale : dispatch())`)
  }
  const fallback = localOnly && rawFallback && rawFallback.provider !== 'ollama' ? null : rawFallback

  return {
    provider,
    model,
    async complete(system, user, opts = {}) {
      // Résolution provider/model IDENTIQUE à askLLM, pour rester un sur-ensemble
      // strict : un appel qui surcharge le provider reçoit le modèle PAR DÉFAUT
      // de ce provider (et non le BRAIN_MODEL d'un autre), comme le ferait askLLM.
      const callProvider = opts.provider ?? provider
      const explicitModel = (opts.model ?? '').trim()
      const chosenModel = explicitModel
        ? explicitModel
        : opts.provider
          ? undefined // provider surchargé → laisse llm-engine choisir son défaut
          : model || undefined // sinon modèle du cerveau ('' → undefined)
      const askOpts: AskLLMOptions = {
        provider: callProvider,
        model: chosenModel,
        maxTokens: opts.maxTokens ?? maxTokens,
        timeoutMs: opts.timeoutMs ?? timeoutMs,
      }
      // Traçage (si tracer) : chaque appel one-shot devient un span sur le Bus,
      // visible par MangoQA — comme chat.turn. Fire-and-forget : un span n'altère
      // ni le résultat ni l'erreur (withSpan rejette si ask lève, comportement
      // inchangé). Sans tracer, appel direct (createBrain reste pur).
      const runAsk = (runOpts: AskLLMOptions, spanAttributes: Record<string, unknown>): Promise<string> => {
        if (!tracer) return ask(system, user, runOpts)
        return tracer.withSpan('brain.complete', () => ask(system, user, runOpts), { attributes: spanAttributes })
      }

      // Sans le gate BRAIN_FALLBACK OU sans repli configuré : comportement
      // STRICTEMENT identique à avant C2-P1 — appel principal, lève tel quel à
      // l'échec. Le contrat « lève, l'appelant décide » du Kernel est préservé.
      if (!flag('BRAIN_FALLBACK') || !fallback) {
        return runAsk(askOpts, { provider: callProvider, model: chosenModel ?? 'default' })
      }

      try {
        return await runAsk(askOpts, { provider: callProvider, model: chosenModel ?? 'default' })
      } catch (mainError) {
        // Repli inter-providers (C2-P1) : UN seul essai. S'il réussit, son
        // résultat remplace celui du principal ; s'il échoue AUSSI, on relève
        // l'erreur ORIGINALE du principal (pas celle du repli) pour que
        // l'appelant garde la sémantique/le message d'erreur habituels.
        const reason = mainError instanceof Error ? mainError.message : String(mainError)
        console.warn(`[kernel-fallback] ${callProvider}→${fallback.provider} : ${reason}`)
        const fallbackModel = fallback.model || undefined
        const fallbackOpts: AskLLMOptions = {
          provider: fallback.provider,
          model: fallbackModel,
          maxTokens: askOpts.maxTokens,
          timeoutMs: askOpts.timeoutMs,
        }
        try {
          return await runAsk(fallbackOpts, {
            provider: fallback.provider,
            model: fallbackModel ?? 'default',
            fallback: true,
          })
        } catch {
          throw mainError
        }
      }
    },
    describe() {
      return `MangosBrain(provider=${provider}, model=${model || 'default'})`
    },
  }
}

// ── Cerveau par défaut du Kernel (singleton, swappable à chaud) ───────────────
// Un seul cerveau « courant » pour tout MangoOS. `setBrain` permet de basculer
// (changement de provider à l'exécution) ; `resetBrain` force une relecture de
// la config au prochain accès.
let current: MangosBrain | null = null

/** Le cerveau courant de MangoOS (créé à la première demande). Le singleton de
 * PRODUCTION active le traçage (getTracer) → chaque appel one-shot est observé
 * sur le Bus. Les tests utilisent createBrain() nu (sans tracer). */
export function getBrain(): MangosBrain {
  if (current === null) current = createBrain({}, { tracer: getTracer() })
  return current
}

/** Bascule le cerveau courant (nouveau provider/modèle, ou faux cerveau de test). */
export function setBrain(brain: MangosBrain): void {
  current = brain
}

/** Oublie le cerveau courant — le prochain getBrain() relira l'environnement. */
export function resetBrain(): void {
  current = null
}
