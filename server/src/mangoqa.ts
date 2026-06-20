// Intégration Mango QA — côté MangoOS.
// Émet un signal phase-complete.json après chaque commit de phase,
// puis attend le verdict de Mango QA (audit-verdict.json).
// Si Mango QA n'est pas lancé, MangoOS continue immédiatement (fail open).
import fs from 'node:fs'
import path from 'node:path'
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
  verdict: 'green' | 'red'
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
): void {
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
}

// Attend le verdict de Mango QA. Renvoie null si timeout (Mango QA non lancé).
// `timeoutMs` paramétrable : court (bloquant, legacy) ou long (watcher async).
export async function waitForVerdict(
  projectName: string,
  timeoutMs: number = VERDICT_TIMEOUT,
): Promise<QAVerdict | null> {
  const projDir = projectDir(projectName)
  const verdictFile = path.join(qaDir(projDir), 'audit-verdict.json')
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    if (fs.existsSync(verdictFile)) {
      try {
        const raw = fs.readFileSync(verdictFile, 'utf8')
        return JSON.parse(raw) as QAVerdict
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
  if (verdict.verdict === 'green') return '✅ Mango QA — Feu Vert'
  return null
}

// Dépendances injectables du watcher (testable sans I/O réelle).
export interface VerdictWatcherDeps {
  wait: (projectName: string, timeoutMs: number) => Promise<QAVerdict | null>
  append: (historyDir: string, text: string) => void
}

const defaultWatcherDeps: VerdictWatcherDeps = {
  wait: waitForVerdict,
  append: (dir, text) => appendHistory(dir, [{ role: 'status', text, ts: new Date().toISOString() }]),
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
