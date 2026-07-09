// #176-global — Stratège GLOBAL proactif : SURFAÇAGE PUSH + boucle fermée (É5).
//
// Deux morceaux dans ce module :
//  1. Les ROUTES HTTP (GET briefing + POST accepte/rejette/reporte) — le contrat
//     « Mango propose, Raf décide » (D7) : chaque item porte un statut piloté par
//     Raf, muté ici et persisté via `saveStrategistState` (É3). Aucune écriture
//     ailleurs que le store du Stratège lui-même.
//  2. L'INJECTION PROACTIVE (D6) d'un briefing COURT dans l'historique de chat au
//     démarrage d'une session — le JUMEAU de `spawnVerdictWatcher` (mangoqa.ts) :
//     même mécanisme `appendHistory` fire-and-forget, jamais bloquant. Gate
//     `STRATEGE_GLOBAL` : OFF → aucune injection, comportement byte-identique.
//
// Ce module NE TOUCHE PAS à la synthèse (stratege-global.ts, É1) ni aux
// collecteurs (stratege-collecteurs.ts, É2) ni à la persistance brute
// (stratege-store.ts, É3) — il les CONSOMME.

import type { Express, Request, Response } from "express"
import { appendHistory } from "../history.js"
import { flag } from "../flags.js"
import { loadStrategistState, saveStrategistState } from "./stratege-store.js"
import type { BriefingItem, ItemStatus, StrategistState } from "./stratege-global-model.js"

// ————————————————————————————————————————————————————————————————
// 1. Routes HTTP — GET briefing, POST accepte/rejette/reporte.
// ————————————————————————————————————————————————————————————————

const ROUTE_STATUS: Record<"accepte" | "rejette" | "reporte", ItemStatus> = {
  accepte: "accepte",
  rejette: "rejete", // le verbe HTTP est "rejette", la valeur du modèle est "rejete"
  reporte: "reporte",
}

/** Trouve un item par id, indépendamment de sa catégorie (proposition/alerte/question). PUR. */
function findItem(state: StrategistState, id: string): BriefingItem | undefined {
  return state.items.find((i) => i.id === id)
}

/** Mute le statut d'un item et persiste. Renvoie l'état mis à jour, ou `null`
 *  si l'id n'existe pas (l'appelant renvoie alors un 404 propre). PUR sur ses
 *  deps (load/save injectables pour les tests), ne lève jamais. */
export function applyItemStatus(
  id: string,
  status: ItemStatus,
  now: () => number = Date.now,
  load: () => StrategistState = () => loadStrategistState(),
  save: (s: StrategistState) => void = (s) => saveStrategistState(s),
): StrategistState | null {
  const state = load()
  const item = findItem(state, id)
  if (!item) return null
  const updatedAt = new Date(now()).toISOString()
  const nextItems = state.items.map((i) => (i.id === id ? { ...i, status, updatedAt } : i))
  const next: StrategistState = { ...state, items: nextItems }
  save(next)
  return next
}

/** Enregistre les routes du Stratège global (patron `registerMangoQaRoutes`,
 *  mangoqa.ts) — routes additives en lecture/écriture sur le store dédié, pas
 *  de gate nécessaire (le store lui-même est fail-open ; la génération du
 *  briefing reste gatée STRATEGE_GLOBAL côté stratege-run.ts). */
export function registerStrategeRoutes(app: Express): void {
  app.get("/api/stratege/briefing", (_req: Request, res: Response) => {
    res.json(loadStrategistState())
  })

  const mutate = (verb: keyof typeof ROUTE_STATUS) => (req: Request, res: Response) => {
    const id = typeof req.params.id === "string" ? req.params.id : undefined
    if (!id) {
      res.status(400).json({ error: "id required" })
      return
    }
    const next = applyItemStatus(id, ROUTE_STATUS[verb])
    if (!next) {
      res.status(404).json({ error: `item introuvable: ${id}` })
      return
    }
    res.json(next)
  }

  app.post("/api/stratege/:id/accepte", mutate("accepte"))
  app.post("/api/stratege/:id/rejette", mutate("rejette"))
  app.post("/api/stratege/:id/reporte", mutate("reporte"))
}

// ————————————————————————————————————————————————————————————————
// 2. Injection PROACTIVE au démarrage de session (D6, jumeau spawnVerdictWatcher).
// ————————————————————————————————————————————————————————————————

/** Construit le résumé COURT (2-4 lignes) à injecter, ou `null` si rien de
 *  saillant à surfacer (aucun item `pending`) — PUR, testable sans I/O. */
export function buildBriefingInjectionMessage(state: StrategistState): string | null {
  const open = state.items.filter((i) => i.status === "pending")
  if (open.length === 0) return null

  const alertes = open.filter((i) => i.kind === "alerte")
  const propositions = open.filter((i) => i.kind === "suggestion")
  const questions = open.filter((i) => i.kind === "question-demande")

  const top = [...open].sort((a, b) => b.saillance - a.saillance)[0]

  const parts: string[] = []
  if (alertes.length) parts.push(`${alertes.length} alerte${alertes.length > 1 ? "s" : ""}`)
  if (propositions.length) parts.push(`${propositions.length} proposition${propositions.length > 1 ? "s" : ""}`)
  if (questions.length) parts.push(`${questions.length} question${questions.length > 1 ? "s" : ""}`)

  const lines = [
    `🎯 **Stratège** — Depuis la dernière synthèse : ${parts.join(", ")}.`,
  ]
  if (top) lines.push(`- ${top.titre}`)
  lines.push(`_Consulte l'onglet Stratège pour accepter, rejeter ou reporter._`)
  return lines.join("\n")
}

/** Deps injectables du surfaçage proactif (testable sans I/O réelle — même
 *  discipline que `VerdictWatcherDeps` de mangoqa.ts). */
export interface StrategeBriefingDeps {
  gateOn: () => boolean
  load: () => StrategistState
  append: (historyDir: string, text: string) => void
}

const defaultStrategeBriefingDeps: StrategeBriefingDeps = {
  gateOn: () => flag("STRATEGE_GLOBAL"),
  load: () => loadStrategistState(),
  append: (dir, text) => appendHistory(dir, [{ role: "status", text, ts: new Date().toISOString() }]),
}

/**
 * Injecte un briefing court dans l'historique de chat AU DÉMARRAGE d'une
 * session (jumeau exact de `spawnVerdictWatcher`, mangoqa.ts) : fire-and-forget,
 * ne bloque JAMAIS le tour, ne lève jamais. Gate OFF ou briefing vide → AUCUNE
 * écriture (0 I/O au-delà du chargement de l'état — comportement inchangé).
 * L'appelant (index.ts) ne doit invoquer cette fonction qu'UNE fois par
 * démarrage de session (même garde que spawnVerdictWatcher : un seul appel au
 * point d'ancrage « nouveau projet/nouvelle conversation »).
 */
export function maybeInjectStrategeBriefing(
  historyDir: string,
  deps: StrategeBriefingDeps = defaultStrategeBriefingDeps,
): void {
  try {
    if (!deps.gateOn()) return
    const state = deps.load()
    const msg = buildBriefingInjectionMessage(state)
    if (!msg) return
    deps.append(historyDir, msg)
  } catch (err) {
    console.warn("[stratege-routes] injection de briefing en échec (ignorée) :", err instanceof Error ? err.message : err)
  }
}
