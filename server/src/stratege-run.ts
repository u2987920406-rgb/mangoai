import "dotenv/config"
// #176-global — Stratège GLOBAL proactif : DÉCLENCHEUR proactif (É4).
//
// Orchestre le pipeline complet du Stratège, dans l'ordre du plan #176 (§3, É4) :
//   collecteurs (É2) → synthesize (É1) → advanceState → prune+save (É3)
// et rien d'autre : la synthèse est déterministe ($0), aucun LLM ici. Chaque
// brique consommée NE LÈVE JAMAIS (spine pur, store fail-open) ; ce module ajoute
// la SEULE garde qui manquait : chaque collecteur tourne dans son propre try/catch
// (fail-open PAR capteur — un capteur mort ne prive pas la synthèse des autres,
// D4), et l'écriture est best-effort.
//
// Deux points d'entrée :
//   - `runStrategistCycle(deps?)` : la fonction orchestratrice, DEPS INJECTABLES
//     (collecteurs / load / save / now / options / log) pour des tests
//     déterministes sans vrai workspace ni réseau.
//   - CLI `npx tsx src/stratege-run.ts` : lance un cycle à la demande (opt-in
//     explicite d'un opérateur ; signale l'état du gate STRATEGE_GLOBAL).
//
// GREFFE PROACTIVE (D6 = PUSH, pas PULL) :
//   - Fin de lot nocturne (nocturnal.ts) : après le lot, gaté STRATEGE_GLOBAL,
//     fail-open — via `maybeRunStrategistCycle` ci-dessous (jamais un throw du
//     Stratège ne fait échouer le lot ; le lot est DÉJÀ terminé quand on l'appelle).
//   - Cron/scheduler : POINT D'EXTENSION documenté, non câblé. `cron-scheduler.ts`
//     est un registre de TÂCHES agentiques par projet (CronTask → runRelay), pas
//     un registre de callbacks périodiques génériques ; y greffer un appel système
//     dénaturerait son contrat. Le déclencheur nocturne (D6) couvre le besoin PUSH ;
//     un opérateur qui veut un rythme propre lance le CLI via un heartbeat cron
//     (mécanisme de reprise déjà utilisé par Raf) — aucune infra nouvelle.

import { flag } from "./flags.js"
import {
  collectQA,
  collectBus,
  collectTraces,
  collectReuse,
  collectBlocages,
  collectLacunes,
  collectMemoire,
} from "./stratege-collecteurs.js"
import { collectDemandesGated } from "./stratege-demandes.js"
import { synthesize, advanceState, type SynthOptions } from "./stratege-global.js"
import { loadStrategistState, saveStrategistState } from "./stratege-store.js"
import type { Briefing, Signal, StrategistState } from "./stratege-global-model.js"

// ————————————————————————————————————————————————————————————————
// Collecteurs par défaut (les 7 sondes d'É2 + le 8ᵉ `demandes` d'É6, ce dernier
// GATÉ par STRATEGE_QUESTION_DEMANDE — collectDemandesGated renvoie [] si le gate
// est OFF, comportement byte-identique).
// ————————————————————————————————————————————————————————————————

/** Les collecteurs réels, chacun déjà fail-open en interne. Ici on les enveloppe
 *  AUSSI d'un try/catch d'orchestration (double garde : même si un collecteur
 *  était un jour modifié pour lever, le cycle survivrait).
 *
 *  `collectDemandesGated` (É6) est le 8ᵉ capteur : il n'émet des signaux que si
 *  STRATEGE_QUESTION_DEMANDE est ON. Il n'est de toute façon atteint que quand le
 *  cycle tourne, c.-à-d. quand STRATEGE_GLOBAL est ON (dépendance de gates). */
export const DEFAULT_COLLECTORS: ReadonlyArray<() => Signal[]> = [
  collectQA,
  collectBus,
  collectTraces,
  collectReuse,
  collectBlocages,
  collectLacunes,
  collectMemoire,
  collectDemandesGated,
]

// ————————————————————————————————————————————————————————————————
// Deps injectables + orchestration.
// ————————————————————————————————————————————————————————————————

export interface StrategistCycleDeps {
  /** Collecteurs de signaux (défaut : les 7 sondes réelles). Chacun est exécuté
   *  dans son propre try/catch : un throw est avalé, les autres tournent quand même. */
  collectors?: ReadonlyArray<() => Signal[]>
  /** Charge l'état persistant (défaut : loadStrategistState, fail-open). */
  load?: () => StrategistState
  /** Persiste l'état (défaut : saveStrategistState, best-effort). */
  save?: (state: StrategistState) => void
  /** Horloge injectable (tests). Défaut : Date.now. */
  now?: () => number
  /** Réglages de saillance passés au spine. */
  options?: SynthOptions
  /** Sink de log (tests / observabilité). Défaut : silencieux. */
  log?: (msg: string) => void
}

export interface StrategistCycleResult {
  briefing: Briefing
  state: StrategistState
  signals: Signal[]
  /** Nombre de collecteurs ayant levé (et été avalés fail-open). */
  collectorErrors: number
}

/** Lance chaque collecteur en fail-open indépendant et concatène les signaux.
 *  NE LÈVE JAMAIS. Renvoie aussi le nombre de collecteurs tombés (diagnostic). */
export function gatherSignals(
  collectors: ReadonlyArray<() => Signal[]>,
  log?: (msg: string) => void,
): { signals: Signal[]; errors: number } {
  const signals: Signal[] = []
  let errors = 0
  for (const collect of collectors) {
    try {
      const out = collect()
      if (Array.isArray(out)) for (const s of out) signals.push(s)
    } catch (err) {
      errors++
      log?.(`[stratege-run] collecteur en échec (ignoré, fail-open) : ${(err as Error)?.message ?? err}`)
    }
  }
  return { signals, errors }
}

/**
 * LE CYCLE. collecteurs (É2) → synthesize (É1) → advanceState → save (É3).
 * Déterministe, NE LÈVE JAMAIS (toutes les briques sont fail-open ; l'écriture
 * est best-effort). Renvoie le briefing + l'état persisté (utile au CLI et aux tests).
 */
export async function runStrategistCycle(deps: StrategistCycleDeps = {}): Promise<StrategistCycleResult> {
  const collectors = deps.collectors ?? DEFAULT_COLLECTORS
  const load = deps.load ?? (() => loadStrategistState())
  const save = deps.save ?? ((s: StrategistState) => saveStrategistState(s))
  const now = (deps.now ?? Date.now)()
  const log = deps.log

  // 1. État précédent (cross-session). loadStrategistState ne lève jamais.
  let previous: StrategistState
  try {
    previous = load()
  } catch (err) {
    log?.(`[stratege-run] chargement d'état en échec (repli synthèse from-scratch) : ${(err as Error)?.message ?? err}`)
    previous = { version: 1, items: [], seen: {}, journal: [] }
  }

  // 2. Collecte fail-open par capteur.
  const { signals, errors } = gatherSignals(collectors, log)

  // 3. Synthèse PURE + avancement d'état (dédup, hits++, journal, bornage).
  const briefing = synthesize(signals, previous, now, deps.options)
  const state = advanceState(previous, signals, briefing, now, deps.options)

  // 4. Persistance best-effort (atomique + bornée dans le store).
  try {
    save(state)
  } catch (err) {
    log?.(`[stratege-run] persistance en échec (état non sauvé, cycle non fatal) : ${(err as Error)?.message ?? err}`)
  }

  return { briefing, state, signals, collectorErrors: errors }
}

/**
 * Garde de greffe PROACTIVE (D6) pour le nocturne. `gateOn` = flag STRATEGE_GLOBAL.
 * OFF → retourne false IMMÉDIATEMENT, `run` n'est jamais appelé (0 I/O, byte-
 * identique). ON → lance le cycle en FAIL-OPEN : un échec est loggé et avalé
 * (jamais un throw ne remonte à l'appelant — le lot nocturne est déjà terminé).
 * Renvoie true ssi le cycle a effectivement tourné jusqu'au bout.
 */
export async function maybeRunStrategistCycle(
  gateOn: boolean,
  run: () => Promise<unknown> = runStrategistCycle,
  log: (msg: string) => void = (m) => console.warn(m),
): Promise<boolean> {
  if (!gateOn) return false
  try {
    await run()
    return true
  } catch (err) {
    log(`[stratege-run] cycle du Stratège en échec (ignoré, lot déjà terminé) : ${(err as Error)?.message ?? err}`)
    return false
  }
}

// ————————————————————————————————————————————————————————————————
// CLI — npx tsx src/stratege-run.ts  (opt-in explicite d'un opérateur).
// ————————————————————————————————————————————————————————————————

async function main(): Promise<void> {
  const gateOn = flag("STRATEGE_GLOBAL")
  console.log(`[stratege-run] cycle manuel — gate STRATEGE_GLOBAL=${gateOn ? "on" : "off (invocation CLI explicite)"}`)
  const t0 = Date.now()
  const { briefing, signals, collectorErrors } = await runStrategistCycle({
    log: (m) => console.log(m),
  })
  const ms = Date.now() - t0
  console.log(
    `[stratege-run] TERMINÉ en ${ms}ms — ${signals.length} signal(aux) collecté(s)` +
      `${collectorErrors ? ` (${collectorErrors} collecteur(s) en échec, ignorés)` : ""}.`,
  )
  console.log(
    `[stratege-run] Briefing : ${briefing.alertes.length} alerte(s), ${briefing.propositions.length} proposition(s), ${briefing.questions.length} question(s).`,
  )
  console.log(`[stratege-run] ${briefing.resume}`)
}

// Lancé en CLI seulement (pas à l'import — les tests importent les fonctions).
const isDirect = process.argv[1] && /[\\/]stratege-run\.(ts|js)$/.test(process.argv[1].replace(/\\/g, "/"))
if (isDirect) {
  main().catch((e) => {
    console.error("[stratege-run] erreur inattendue :", e)
    process.exit(1)
  })
}
