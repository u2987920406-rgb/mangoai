// Intégration Mango QA — côté MangoOS.
// Émet un signal phase-complete.json après chaque commit de phase,
// puis attend le verdict de Mango QA (audit-verdict.json).
// Si Mango QA n'est pas lancé, MangoOS continue immédiatement (fail open).
import fs from 'node:fs'
import path from 'node:path'
import type { Express, Request, Response } from 'express'
import { WORKSPACE_DIR } from './projects.js'
import { appendHistory } from './history.js'

const QA_DIR = '.mangoqa'
const VERDICT_TIMEOUT = parseInt(process.env.QA_VERDICT_TIMEOUT ?? '60000', 10)
// Surfaçage ASYNCHRONE : le tour ne bloque plus sur le verdict (architecture
// « audit fantôme »). Le watcher attend bien plus longtemps que l'ancien blocage
// 60 s — un gros projet met ~143 s — puis injecte le verdict dans l'historique.
const VERDICT_ASYNC_TIMEOUT = parseInt(process.env.QA_VERDICT_ASYNC_TIMEOUT ?? '300000', 10)
const POLL_INTERVAL = 800
const SENTINEL_MAX_AGE_MS = 300_000 // stale après 5 min — le runner met à jour toutes les 10 s mais l'event loop Windows peut être lente

// Détecte si le runner Mango QA est actif en lisant la sentinelle heartbeat.
// Retourne true uniquement si le fichier existe ET date de moins de 30 s.
export function isMangoQaActive(): boolean {
  // Surcharge manuelle via .env (permet de forcer ON ou OFF)
  if (process.env.MANGOQA_ENABLED === 'false') return false
  if (process.env.MANGOQA_ENABLED === 'true') return true
  // Détection automatique par sentinelle
  const sentinel = path.join(WORKSPACE_DIR, '.mangoqa-active')
  if (!fs.existsSync(sentinel)) return false
  try {
    const data = JSON.parse(fs.readFileSync(sentinel, 'utf8')) as { heartbeat?: string }
    if (!data.heartbeat) return false
    return Date.now() - new Date(data.heartbeat).getTime() < SENTINEL_MAX_AGE_MS
  } catch {
    return false
  }
}

export interface QAVerdict {
  signalTimestamp?: string
  verdict: 'green' | 'red' | 'unknown'
  rejection: {
    rejection_id: string
    corrective_action: string
    rule_ref: string
    branch: string
    retry_count: number
  } | null
  branches: Record<string, { status: string; summary: string }>
}

function projectDir(projectName: string): string {
  const safe = projectName.replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase()
  return path.join(WORKSPACE_DIR, safe)
}

function qaDir(projDir: string): string {
  return path.join(projDir, QA_DIR)
}

// Émet le signal pour que Mango QA démarre l'audit.
export function emitPhaseComplete(
  projectName: string,
  phase: string,
  changedFiles: string[],
  retryCount = 0,
): string {
  const projDir = projectDir(projectName)
  const dir = qaDir(projDir)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const signal = {
    projectName,
    phase,
    timestamp: new Date().toISOString(),
    projectDir: projDir,
    changedFiles,
    retryCount,
  }
  // Supprime l'ancien verdict avant d'émettre le nouveau signal
  const verdictFile = path.join(dir, 'audit-verdict.json')
  if (fs.existsSync(verdictFile)) fs.unlinkSync(verdictFile)
  fs.writeFileSync(path.join(dir, 'phase-complete.json'), JSON.stringify(signal, null, 2), 'utf8')
  return signal.timestamp
}

// Attend le verdict de Mango QA. Renvoie null si timeout (Mango QA non lancé).
// `timeoutMs` paramétrable : court (bloquant, legacy) ou long (watcher async).
export async function waitForVerdict(
  projectName: string,
  timeoutMs: number = VERDICT_TIMEOUT,
  expectedTimestamp?: string,
): Promise<QAVerdict | null> {
  const projDir = projectDir(projectName)
  const verdictFile = path.join(qaDir(projDir), 'audit-verdict.json')
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    if (fs.existsSync(verdictFile)) {
      try {
        const raw = fs.readFileSync(verdictFile, 'utf8')
        const verdict = JSON.parse(raw) as QAVerdict
        if (!expectedTimestamp || verdict.signalTimestamp === expectedTimestamp) return verdict
      } catch {
        return null
      }
    }
    await new Promise(r => setTimeout(r, POLL_INTERVAL))
  }
  return null // timeout — Mango QA non lancé ou trop lent
}

// Construit le message de rejet injecté dans le chat MangoOS.
export function buildRejectionMessage(verdict: QAVerdict): string {
  if (!verdict.rejection) return ''
  const r = verdict.rejection
  return `🔴 **Mango QA — Feu Rouge** (branche: ${r.branch})

**Problème détecté :** ${r.rejection_id}
**Action requise :** ${r.corrective_action}
**Règle :** \`${r.rule_ref}\`

Corrige ce point avant de continuer. MangoOS relancera l'audit automatiquement.`
}

// Message de chat à partir d'un verdict — pur. Feu Rouge → message de rejet,
// Feu Vert → confirmation, sinon null (rien à surfacer).
export function buildVerdictMessage(verdict: QAVerdict): string | null {
  if (verdict.verdict === 'red') return buildRejectionMessage(verdict) || null
  if (verdict.verdict === 'unknown') return '⚪ Mango QA — Non vérifié : audit incomplet ou indisponible.'
  if (verdict.verdict === 'green') return '✅ Mango QA — Feu Vert'
  return null
}

// ── Auditeur de Flux (#137) — surfaçage des observations dans le chat ─────────
// L'Auditeur (visage de Mango QA, repo MangoQA) écrit flux-observations.json à
// côté du verdict. On le lit en SEULE LECTURE et on ajoute une ligne 🧭 au chat
// si quelque chose mérite l'attention de Raf. Conseil, jamais bloquant.
export interface FluxObservationLite {
  measured?: { phantomTargets?: unknown[] }
  convergence?: string[]
  summary?: string
  counts?: { measured?: number; convergence?: number }
}

export function readFluxObservations(projectName: string): FluxObservationLite | null {
  const file = path.join(qaDir(projectDir(projectName)), 'flux-observations.json')
  try {
    if (!fs.existsSync(file)) return null
    return JSON.parse(fs.readFileSync(file, 'utf8')) as FluxObservationLite
  } catch {
    return null
  }
}

// Message de chat à partir des observations de flux — pur. Rien à dire si le flux
// est cohérent (aucun fait mesuré ni question). Sinon un résumé + les questions.
export function buildFluxMessage(obs: FluxObservationLite | null): string | null {
  if (!obs) return null
  const measured = obs.counts?.measured ?? obs.measured?.phantomTargets?.length ?? 0
  const conv = obs.counts?.convergence ?? obs.convergence?.length ?? 0
  if (measured === 0 && conv === 0) return null
  const lines = [`🧭 **Auditeur de Flux** — ${(obs.summary ?? '').trim()}`.trim()]
  for (const q of (obs.convergence ?? []).slice(0, 5)) lines.push(`- ${q}`)
  return lines.join('\n')
}

// Tier 1 (#137) — audit LLM conseil. flux-deep-observations.json (ecrit par MangoQA
// quand un declencheur cost-aware s'arme). Surface seulement si l'audit a tourne ET
// a des observations. Conseil, jamais bloquant.
export interface FluxDeepObservationLite {
  ran?: boolean
  findings?: Array<{ observation?: string }>
  summary?: string
}

export function readFluxDeepObservations(projectName: string): FluxDeepObservationLite | null {
  const file = path.join(qaDir(projectDir(projectName)), 'flux-deep-observations.json')
  try {
    if (!fs.existsSync(file)) return null
    return JSON.parse(fs.readFileSync(file, 'utf8')) as FluxDeepObservationLite
  } catch {
    return null
  }
}

export function buildFluxDeepMessage(obs: FluxDeepObservationLite | null): string | null {
  if (!obs || !obs.ran) return null
  const findings = (obs.findings ?? []).filter(f => f && typeof f.observation === 'string')
  if (findings.length === 0) return null
  const lines = [`🧭+ **Auditeur de Flux — audit profond** ${(obs.summary ?? '').trim()}`.trim()]
  for (const f of findings.slice(0, 6)) lines.push(`- ${(f.observation as string).trim()}`)
  return lines.join('\n')
}

// Dépendances injectables du watcher (testable sans I/O réelle).
export interface VerdictWatcherDeps {
  wait: (projectName: string, timeoutMs: number) => Promise<QAVerdict | null>
  append: (historyDir: string, text: string) => void
  /** Lecture des observations de flux (#137) — injectable pour les tests. */
  readFlux?: (projectName: string) => FluxObservationLite | null
  /** Lecture des observations de flux profondes Tier 1 (#137) — injectable. */
  readFluxDeep?: (projectName: string) => FluxDeepObservationLite | null
}

const defaultWatcherDeps: VerdictWatcherDeps = {
  wait: waitForVerdict,
  append: (dir, text) => appendHistory(dir, [{ role: 'status', text, ts: new Date().toISOString() }]),
  readFlux: readFluxObservations,
  readFluxDeep: readFluxDeepObservations,
}

// Attend le verdict (timeout long) puis l'écrit dans l'historique du projet —
// le chat le re-fetch et l'affiche, même arrivé bien après la fin du tour.
// Renvoie le message surfacé (ou null si timeout / rien à dire). Logique pure
// sur ses deps → testable sans filesystem ni vrai audit.
export async function surfaceVerdict(
  projectName: string,
  historyDir: string,
  deps: VerdictWatcherDeps = defaultWatcherDeps,
  timeoutMs: number = VERDICT_ASYNC_TIMEOUT,
): Promise<string | null> {
  const verdict = await deps.wait(projectName, timeoutMs)
  if (!verdict) return null
  const msg = buildVerdictMessage(verdict)
  if (msg) deps.append(historyDir, msg)
  // Auditeur de Flux (#137) : surfaçage additionnel, en plus du verdict. Conseil.
  const flux = buildFluxMessage((deps.readFlux ?? readFluxObservations)(projectName))
  if (flux) deps.append(historyDir, flux)
  const fluxDeep = buildFluxDeepMessage((deps.readFluxDeep ?? readFluxDeepObservations)(projectName))
  if (fluxDeep) deps.append(historyDir, fluxDeep)
  return msg
}

// Un watcher actif au plus par projet (évite deux surfaçages concurrents si deux
// tours rapides s'enchaînent ; emitPhaseComplete a déjà purgé l'ancien verdict).
const watching = new Set<string>()

// Lance le surfaçage du verdict en fire-and-forget — NE bloque jamais le tour.
export function spawnVerdictWatcher(
  projectName: string,
  historyDir: string,
  deps: VerdictWatcherDeps = defaultWatcherDeps,
): void {
  if (watching.has(projectName)) return
  watching.add(projectName)
  void surfaceVerdict(projectName, historyDir, deps)
    .then(msg => { if (msg) console.log(`[mangoqa] verdict surfacé (${projectName})`) })
    .catch(err => console.warn('[mangoqa]', err instanceof Error ? err.message : err))
    .finally(() => { watching.delete(projectName) })
}

// ── Observateur-Conseil (D2b) — rapport global cross-projets ──────────────────
// Visage 2 de Mango QA : contrairement au Contrôleur et à l'Auditeur de Flux
// (par projet), l'Observateur-Conseil écrit un unique rapport à la racine du
// workspace : <workspace>/.mangoqa/observer-report.json (même dossier que
// bus-events.jsonl, cf. kernel-mangoqa-bridge.ts). SEULE LECTURE, fail-open :
// le fichier peut être absent (gate QA_OBSERVER off côté MangoQA) sans jamais
// casser MangoOS.
const OBSERVER_REPORT_FILE = 'observer-report.json'
const OBSERVER_REPORT_MAX_BYTES = 1_000_000 // garde-fou — le rapport est petit en pratique

export interface ObserverPattern {
  kind: 'branche-recurrente' | 'regle-recurrente' | 'projet-recurrent' | string
  subject: string
  count: number
  share: number
  examples: string[]
}

export interface ObserverReportBody {
  totalEvents: number
  patterns: ObserverPattern[]
  suggestions: string[]
  summary: string
}

export interface ObserverReport {
  generatedAt: string
  windowEvents: number
  report: ObserverReportBody
  rendered: string
}

export type ObserverReportResult =
  | ({ available: true } & ObserverReport)
  | { available: false; reason: 'absent' | 'invalide' | 'illisible' }

function isValidObserverReport(v: unknown): v is ObserverReport {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  if (typeof o.generatedAt !== 'string') return false
  if (typeof o.windowEvents !== 'number') return false
  if (typeof o.rendered !== 'string') return false
  if (!o.report || typeof o.report !== 'object') return false
  const r = o.report as Record<string, unknown>
  if (typeof r.summary !== 'string') return false
  if (!Array.isArray(r.suggestions)) return false
  if (!Array.isArray(r.patterns)) return false
  return true
}

// Résout, lit et valide observer-report.json. `workspaceDir` injectable pour
// les tests (défaut : WORKSPACE_DIR réel). Jamais de throw.
export function readObserverReport(workspaceDir: string = WORKSPACE_DIR): ObserverReportResult {
  const file = path.join(workspaceDir, QA_DIR, OBSERVER_REPORT_FILE)
  let stat: fs.Stats
  try {
    stat = fs.statSync(file)
  } catch {
    return { available: false, reason: 'absent' }
  }
  if (stat.size > OBSERVER_REPORT_MAX_BYTES) return { available: false, reason: 'illisible' }

  let raw: string
  try {
    raw = fs.readFileSync(file, 'utf8')
  } catch {
    return { available: false, reason: 'illisible' }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { available: false, reason: 'invalide' }
  }

  if (!isValidObserverReport(parsed)) return { available: false, reason: 'invalide' }

  return {
    available: true,
    generatedAt: parsed.generatedAt,
    windowEvents: parsed.windowEvents,
    report: parsed.report,
    rendered: parsed.rendered,
  }
}

// ── Disjoncteur (Visage 1) — lecture du verdict d'arrêt ──────────────────────
// Le Disjoncteur MangoQA (dépôt MangoQA, module DÉTERMINISTE zéro-LLM) écrit
// toutes les 5 s <workspace>/.mangoqa/breaker-verdict.json — un snapshot du
// dernier verdict de ses 5 réflexes de sécurité. Conforme à la fondation §V,
// MangoQA n'AGIT jamais : il ÉCRIT un constat, MangoOS le LIT et décide seul de
// s'arrêter (cf. decideBreakerStop dans nocturnal.ts). SEULE LECTURE, fail-open
// exactement comme readObserverReport : absent/invalide/trop gros → valeur
// neutre, jamais de throw. Miroir minimal du type BreakerReport (MangoQA).
const BREAKER_VERDICT_FILE = 'breaker-verdict.json'
const BREAKER_VERDICT_MAX_BYTES = 1_000_000 // garde-fou — le verdict est petit en pratique

export interface BreakerTripLite {
  breaker: string
  action: string
  reason: string
}

export type BreakerVerdictResult =
  | { available: true; safe: boolean; trips: BreakerTripLite[]; evaluatedAt: number; /** Bus silencieux (busLiveness.stale du verdict) : le Disjoncteur est aveugle. */ busStale?: boolean; busAgeMs?: number }
  | { available: false; reason: 'absent' | 'invalide' | 'illisible' }

// Garde de forme minimale : on n'exige que `safe: boolean` + `trips: array` — le
// reste est optionnel et lu défensivement (un champ absent ne casse rien).
function isValidBreakerVerdict(v: unknown): v is { safe: boolean; trips: unknown[] } {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  if (typeof o.safe !== 'boolean') return false
  if (!Array.isArray(o.trips)) return false
  return true
}

// Ne garde que les champs texte utiles d'un trip, tout défensivement (un verdict
// mal formé ne doit jamais faire crasher la lecture).
function normalizeTrips(raw: unknown[]): BreakerTripLite[] {
  const out: BreakerTripLite[] = []
  for (const t of raw) {
    if (!t || typeof t !== 'object') continue
    const o = t as Record<string, unknown>
    out.push({
      breaker: typeof o.breaker === 'string' ? o.breaker : '?',
      action: typeof o.action === 'string' ? o.action : '?',
      reason: typeof o.reason === 'string' ? o.reason : '',
    })
  }
  return out
}

// #9 (audit dormant) : `busLiveness.stale` était écrit par MangoQA mais lu par personne. On le remonte.
function busLivenessOf(v: unknown): { busStale?: boolean; busAgeMs?: number } {
  if (!v || typeof v !== 'object') return {}
  const o = v as Record<string, unknown>
  return {
    ...(typeof o.stale === 'boolean' ? { busStale: o.stale } : {}),
    ...(typeof o.ageMs === 'number' ? { busAgeMs: o.ageMs } : {}),
  }
}

// Résout, lit et valide breaker-verdict.json. `workspaceDir` injectable pour les
// tests (défaut : WORKSPACE_DIR réel). Jamais de throw — même esprit que
// readObserverReport / ObserverReportResult.
export function readBreakerVerdict(workspaceDir: string = WORKSPACE_DIR): BreakerVerdictResult {
  const file = path.join(workspaceDir, QA_DIR, BREAKER_VERDICT_FILE)
  let stat: fs.Stats
  try {
    stat = fs.statSync(file)
  } catch {
    return { available: false, reason: 'absent' }
  }
  if (stat.size > BREAKER_VERDICT_MAX_BYTES) return { available: false, reason: 'illisible' }

  let raw: string
  try {
    raw = fs.readFileSync(file, 'utf8')
  } catch {
    return { available: false, reason: 'illisible' }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { available: false, reason: 'invalide' }
  }

  if (!isValidBreakerVerdict(parsed)) return { available: false, reason: 'invalide' }

  const o = parsed as Record<string, unknown>
  return {
    available: true,
    safe: parsed.safe,
    trips: normalizeTrips(parsed.trips),
    evaluatedAt: typeof o.evaluatedAt === 'number' ? o.evaluatedAt : 0,
    ...busLivenessOf(o.busLiveness),
  }
}

/** Âge max d'un verdict pour être cru (le runner MangoQA le réécrit toutes les 5 s). */
export const BREAKER_VERDICT_MAX_AGE_MS = 10 * 60_000;

/** Verdict du Disjoncteur, traité comme indisponible s'il est périmé. PUR sur `read`/`now`. */
export function freshBreakerVerdict(
  read: () => BreakerVerdictResult = () => readBreakerVerdict(WORKSPACE_DIR),
  now: number = Date.now(),
  maxAgeMs: number = BREAKER_VERDICT_MAX_AGE_MS,
): BreakerVerdictResult {
  const v = read();
  if (!v.available) return v;
  if (v.evaluatedAt > 0 && now - v.evaluatedAt > maxAgeMs) return { available: false, reason: "absent" };
  return v;
}

// Route additive en lecture seule — pas de gate nécessaire (fail-open assuré
// par readObserverReport). Enregistrée dans index.ts près de registerControleurRoutes.
export function registerMangoQaRoutes(app: Express): void {
  app.get('/api/mangoqa/observer', (_req: Request, res: Response) => {
    res.json(readObserverReport())
  })
}
