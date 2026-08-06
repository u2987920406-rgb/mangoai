// Brain-Dispatch — le RATE LIMITER, extrait de `brain-dispatch.ts` (2026-08-06).
//
// Fenêtre glissante de 60 s par provider, avec backoff exponentiel. Le comportement
// est repris À L'IDENTIQUE : mêmes plafonds, mêmes 3 tentatives, même backoff
// 1 s → 2 s → 4 s, même laisser-passer final. Ce fichier ne change rien à ce que
// fait le dispatcher — il lui retire une responsabilité qui n'était pas la sienne.
//
// CE QUI EST RÉELLEMENT NOUVEAU : l'horloge est injectable.
// `acquireSlot` appelait `Date.now()` en dur. Conséquence : l'expiration de la
// fenêtre — le cœur du mécanisme — était **intestable sans attendre 60 secondes
// réelles**. Un test qui ne peut pas s'écrire est une garantie qu'on n'a pas.
// `sleep` était déjà injecté ; l'horloge ne l'était pas, et c'est exactement la
// moitié du problème qui manquait.

import type { LLMProvider } from "../llm/llm-engine.js"

/** Appels autorisés par minute et par provider. */
export const RATE_LIMITS: Record<LLMProvider, number> = {
  claude: 10,
  ollama: 999,   // LOCAL : pas de limite réelle, la machine est le seul plafond
  openai: 20,
  deepseek: 20,
  mistral: 20,
  groq: 30,
  openrouter: 20,
  litellm: 999,
}

// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ `ollama` N'EST PAS TOUJOURS LOCAL — mesuré le 2026-08-06
// ─────────────────────────────────────────────────────────────────────────────
// Le plafond `ollama: 999` porte un motif écrit : « local → pas de limite réelle ».
// Il est FAUX pour les modèles à suffixe `:cloud` (`glm-5.2:cloud`, `qwen3.5:cloud`),
// qui tournent chez Ollama, sont DISTANTS et FACTURÉS sur le forfait de Raf. Or ce
// sont eux qui portent le vrai travail : `ELEVE_MODEL=glm-5.2:cloud`, et l'appel
// « Qwen » de l'Accueil.
//
// Conséquence : les appels les plus coûteux du produit étaient comptés comme
// gratuits et illimités. Le limiteur n'était pas simplement inexact — il l'était
// exactement là où il aurait servi.
//
// Ce qui est fait ici : les modèles `:cloud` ont désormais leur PROPRE fenêtre,
// séparée du local. Le plafond reste volontairement à 999 : je ne connais pas le
// débit réel du forfait Ollama, et inventer un chiffre brimerait le produit sur une
// supposition. Le compteur existe et se lit (`slotsConsommes("ollama:cloud")`) —
// le renseigner est une donnée à fournir, pas une décision de code.
const CLOUD_SUFFIXE = ":cloud"
export const OLLAMA_CLOUD = "ollama:cloud"
const LIMITE_OLLAMA_CLOUD = 999

/** La clé de fenêtre d'un appel : le provider, sauf un modèle Ollama `:cloud` qui a
 *  la sienne. PURE — c'est la seule chose qui distingue « chez moi » de « chez eux ». */
export function cleDeFenetre(provider: LLMProvider, model?: string): string {
  return provider === "ollama" && model?.endsWith(CLOUD_SUFFIXE) ? OLLAMA_CLOUD : provider
}

/** Plafond par défaut d'un provider absent de la table — jamais illimité par accident. */
const DEFAUT = 20
const FENETRE_MS = 60_000
const TENTATIVES = 3

const windows = new Map<string, { count: number; windowStart: number }>()

export type Sleep = (ms: number) => Promise<void>
export type Horloge = () => number

/**
 * Réserve un créneau d'appel pour ce provider, en attendant (backoff) si saturé.
 *
 * Après 3 tentatives infructueuses, on LAISSE PASSER : le 429 éventuel du provider
 * (géré par `askLLM`) prend alors le relais. C'est délibéré — bloquer indéfiniment
 * un pipeline pour respecter une limite qu'on s'est nous-même fixée serait pire que
 * la dépasser une fois.
 */
export async function acquireSlot(
  provider: LLMProvider,
  sleep: Sleep,
  now: Horloge = Date.now,
  model?: string,
): Promise<void> {
  const cle = cleDeFenetre(provider, model)
  const max = cle === OLLAMA_CLOUD ? LIMITE_OLLAMA_CLOUD : (RATE_LIMITS[provider] ?? DEFAUT)
  for (let tentative = 0; tentative < TENTATIVES; tentative++) {
    const t = now()
    let w = windows.get(cle)
    if (!w || t - w.windowStart >= FENETRE_MS) {
      w = { count: 0, windowStart: t }
      windows.set(cle, w)
    }
    if (w.count < max) {
      w.count++
      return
    }
    // Saturé → backoff exponentiel 1 s → 2 s → 4 s avant de réessayer.
    await sleep(1000 * 2 ** tentative)
  }
  const w = windows.get(cle) ?? { count: 0, windowStart: now() }
  w.count++
  windows.set(cle, w)
}

/** Remet à zéro les compteurs (tests). */
export function resetRateLimits(): void {
  windows.clear()
}

/** Ce que le limiteur a compté pour ce provider — lecture seule, pour les tests et
 *  le diagnostic. Renvoie 0 si aucune fenêtre n'est ouverte. */
export function slotsConsommes(cle: LLMProvider | string): number {
  return windows.get(cle)?.count ?? 0
}
