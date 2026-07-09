// MangoOS Kernel — Pont MangoQA (intégration, cf. fondation.md).
//
// MangoQA est un FANTÔME INDÉPENDANT : process séparé, qui parle à MangoOS par
// filesystem (cf. mangoqa.ts : phase-complete.json → audit-verdict.json). Il ne
// peut donc pas s'abonner à l'Event Bus en-process. Ce pont fait le lien :
//
//   Event Bus (en-process) ──observateur '*'──▶ flux .mangoqa/bus-events.jsonl
//                                                        │
//                                                        ▼  (lu par le fantôme)
//                                              MangoQA — Visage 2 (Observateur-Conseil)
//
// Le pont ÉCRIT seulement (il n'orchestre rien, ne reçoit aucun ordre du fantôme),
// en fire-and-forget : un échec d'export ne casse JAMAIS le flux MangoOS. C'est la
// traduction fidèle de « MangoQA lit les traces via l'observateur '*' » — sans
// rien mettre de MangoQA dans le système qu'il surveille.

import fs from 'node:fs'
import path from 'node:path'
import { WILDCARD, type KernelBus, type MangoEnvelope } from './kernel-bus.js'
import { WORKSPACE_DIR } from '../projects.js'

/** agentId de l'observateur sur le Bus. */
export const MANGOQA_OBSERVER = 'mangoqa-bridge'

/** Canal que le fantôme lit (flux d'observation, distinct du canal d'audit
 * requête/réponse phase-complete/verdict de mangoqa.ts). */
export const BUS_EVENTS_FILE = 'bus-events.jsonl'

export interface MangoQaBridgeOptions {
  /** Écriture d'une ligne (injectable pour tests). Défaut : append fichier. */
  appendLine?: (line: string) => void
  /** Horloge (injectable). Défaut : Date.now. */
  now?: () => number
  /** Quels événements exporter. Défaut : tous. */
  filter?: (env: MangoEnvelope) => boolean
}

/** Append par défaut : workspace/.mangoqa/bus-events.jsonl (best-effort). */
function defaultAppend(line: string): void {
  const dir = path.join(WORKSPACE_DIR, '.mangoqa')
  fs.mkdirSync(dir, { recursive: true })
  fs.appendFileSync(path.join(dir, BUS_EVENTS_FILE), line + '\n', 'utf8')
}

/** Branche le pont sur un bus : s'abonne en observateur '*' et exporte chaque
 * enveloppe vers le canal MangoQA. Renvoie la fonction de débranchement. */
export function attachMangoQaBridge(bus: KernelBus, opts: MangoQaBridgeOptions = {}): () => void {
  const append = opts.appendLine ?? defaultAppend
  const now = opts.now ?? (() => Date.now())
  const filter = opts.filter ?? (() => true)

  return bus.subscribe(WILDCARD, MANGOQA_OBSERVER, (env) => {
    try {
      if (!filter(env)) return
      const record = { ...env, exportedAt: now() }
      append(JSON.stringify(record))
    } catch {
      // fire-and-forget : l'export ne doit jamais casser ni ralentir le flux.
    }
  })
}

// ── Installation au boot (idempotente) ───────────────────────────────────────
// Branché une seule fois sur le bus du Kernel au démarrage du serveur.
let installed: (() => void) | null = null

/** Installe le pont sur un bus (getBus() par défaut). Idempotent. */
export function installMangoQaBridge(bus: KernelBus, opts: MangoQaBridgeOptions = {}): void {
  if (installed) return
  installed = attachMangoQaBridge(bus, opts)
}

/** Désinstalle le pont (tests / arrêt propre). */
export function uninstallMangoQaBridge(): void {
  if (installed) {
    installed()
    installed = null
  }
}
