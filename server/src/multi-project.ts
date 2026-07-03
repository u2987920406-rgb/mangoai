import type { Express, Request, Response } from 'express'
import { atomicWriteFileSync } from "./safe-io.js";
import fs from 'node:fs'
import path from 'node:path'
import { resolveProvider } from './llm-engine.js'
import { getBrain } from './kernel.js'

const WORKSPACE_DIR = path.join(process.cwd(), '..', 'workspace')

// Phase 3 idée #26 — index sémantique (résumés via l'Élève local Gemma/Ollama — $0, hors crédits API)
const DATA_DIR = path.join(process.cwd(), '..', 'server', 'data')
const INDEX_FILE = path.join(DATA_DIR, 'multi-project-index.json')

const EXCLUDED_DIRS = new Set(['node_modules', '.mango', 'dist', '.git', '.cache', '.next', '.nuxt'])

// Sous-dossiers de src/ à scanner (relatifs à src/)
const SRC_SUBDIRS = ['components', 'hooks', 'utils', 'services', 'types', 'lib']

// Extensions acceptées
const ACCEPTED_EXT = /\.(jsx|tsx|ts|js)$/
// Fichiers à exclure
const EXCLUDED_FILE = /\.(test|spec)\.(jsx|tsx|ts|js)$|\.d\.ts$/

type FileCategory = 'component' | 'hook' | 'util' | 'service' | 'type' | 'other'

function isExcluded(name: string): boolean {
  return EXCLUDED_DIRS.has(name) || name.startsWith('.')
}

function inferCategory(relPath: string): FileCategory {
  const normalized = relPath.replace(/\\/g, '/')
  const fileName = normalized.split('/').pop() ?? ''

  if (normalized.includes('src/services/')) return 'service'
  if (normalized.includes('src/types/')) return 'type'
  if (normalized.includes('src/hooks/') || fileName.startsWith('use')) return 'hook'
  if (normalized.includes('src/utils/') || normalized.includes('src/lib/')) return 'util'
  if (normalized.includes('src/components/') || /\.(jsx|tsx)$/.test(fileName)) return 'component'
  return 'other'
}

interface SourceFile {
  file: string
  size: number
  preview: string[]
  category: FileCategory
}

export function findSourceFiles(projectPath: string): string[] {
  const results: string[] = []

  // Scanner chaque sous-dossier connu de src/
  for (const subdir of SRC_SUBDIRS) {
    const dirAbs = path.join(projectPath, 'src', subdir)
    if (!fs.existsSync(dirAbs)) continue
    try {
      const entries = fs.readdirSync(dirAbs, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.isDirectory()) continue
        if (!ACCEPTED_EXT.test(entry.name)) continue
        if (EXCLUDED_FILE.test(entry.name)) continue
        results.push(path.join('src', subdir, entry.name))
      }
    } catch {
      // ignorer les erreurs de lecture
    }
  }

  // Scanner src/ lui-même (fichiers à la racine)
  const srcDir = path.join(projectPath, 'src')
  if (fs.existsSync(srcDir)) {
    try {
      const entries = fs.readdirSync(srcDir, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.isDirectory()) continue
        if (!ACCEPTED_EXT.test(entry.name)) continue
        if (EXCLUDED_FILE.test(entry.name)) continue
        results.push(path.join('src', entry.name))
      }
    } catch {
      // ignorer
    }
  }

  return results
}

function getPreview(filePath: string): string[] {
  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    return content.split('\n').slice(0, 3)
  } catch {
    return []
  }
}

// ── Phase 2 idée #26 — injection prompt multi-projets ───────────────────────

/**
 * Règles injectées dans le system prompt pour que l'agent consulte les fichiers
 * des AUTRES projets du workspace avant de recoder un composant/hook/util.
 *
 * DISTINCTION avec la bibliothèque curée `.components` (idée #36) :
 * - `.components/` = composants VALIDÉS, génériques, extraits manuellement
 *   (bibliothèque curated — voir COMPONENTS_RULES dans components.ts).
 * - La section ci-dessous = scan BRUT de tes autres projets réels `workspace/<projet>/src/…`
 *   Ce sont tes chantiers vivants, non filtrés — une mine d'inspiration et de
 *   code fonctionnel, mais pas encore « promu » en bibliothèque.
 */
export const MULTI_PROJECT_RULES = `
Cross-project source files (your other workspace projects — raw, not curated):
IMPORTANT DISTINCTION — two separate knowledge stores exist:
  1. Curated component library (workspace/.components/) → listed by COMPONENTS_RULES above. These are validated, generic, deliberately extracted components.
  2. Raw project files (below) → source files found in your OTHER real projects (workspace/<project>/src/…). These are living code, project-specific, NOT yet promoted to the library.
Before coding a new component, hook, util or service:
- Check the list of raw project files injected below.
- If a file from another project looks relevant, READ it (workspace/<project>/<path>) to understand its API; then ADAPT or COPY it to the current project — do not recode what already works.
- Mention explicitly what you reused and from which project.
- If the reused code is generic enough (≥ 20 lines, clean props/API, no hard-coded project data), save it to the curated library too (workspace/.components/ per COMPONENTS_RULES).`;

/**
 * Construit la section du system prompt listant les fichiers source des AUTRES
 * projets du workspace (scan brut via findSourceFiles).
 *
 * @param workspaceDir  Chemin absolu du dossier workspace/.
 * @param currentProject Nom du projet courant (basename) — exclu de la liste.
 * @returns Section formatée, ou "" si aucun autre projet ne contient de fichiers.
 */
export function multiProjectPromptSection(workspaceDir: string, currentProject?: string): string {
  if (!fs.existsSync(workspaceDir)) return "";

  let projectDirs: fs.Dirent[];
  try {
    projectDirs = fs.readdirSync(workspaceDir, { withFileTypes: true });
  } catch {
    return "";
  }

  // Constantes de plafonnement pour rester économe en tokens
  const MAX_FILES_PER_PROJECT = 8;
  const MAX_TOTAL = 40;

  const sections: string[] = [];
  let totalCount = 0;

  for (const entry of projectDirs) {
    if (!entry.isDirectory()) continue;
    if (isExcluded(entry.name)) continue;
    if (currentProject && entry.name === currentProject) continue;
    if (totalCount >= MAX_TOTAL) break;

    const projectPath = path.join(workspaceDir, entry.name);
    const allFiles = findSourceFiles(projectPath);

    if (allFiles.length === 0) continue;

    // Prioriser les composants (category === 'component') puis les autres
    const components = allFiles.filter((f) => inferCategory(f) === 'component');
    const others = allFiles.filter((f) => inferCategory(f) !== 'component');
    const ordered = [...components, ...others];

    const available = MAX_TOTAL - totalCount;
    const capped = ordered.slice(0, Math.min(MAX_FILES_PER_PROJECT, available));
    const omitted = ordered.length - capped.length;

    const lines = capped.map((relPath) => {
      const cat = inferCategory(relPath);
      const fwd = relPath.replace(/\\/g, '/');
      return `  - [${cat}] ${entry.name}/${fwd}`;
    });
    if (omitted > 0) {
      lines.push(`  - … et ${omitted} autre${omitted > 1 ? 's' : ''} fichier${omitted > 1 ? 's' : ''}`);
    }

    sections.push(`**${entry.name}** (${allFiles.length} fichier${allFiles.length > 1 ? 's' : ''}):\n${lines.join('\n')}`);
    totalCount += capped.length;
  }

  if (sections.length === 0) return "";

  return (
    `\n\nRaw source files from your other projects (${totalCount} listed` +
    (totalCount === MAX_TOTAL ? `, capped at ${MAX_TOTAL}` : '') +
    `):\n` +
    sections.join('\n')
  );
}

// ── Phase 3 idée #26 — indexation sémantique + recherche ────────────────────

interface IndexEntry {
  project: string
  file: string
  category: FileCategory
  summary: string
  degraded?: boolean
  hash: string
  indexedAt: string
}

interface IndexStore {
  entries: Record<string, IndexEntry>
}

// Bornage du temps par run d'indexation (configurable via .env)
const MAX_FILES_PER_RUN = Number(process.env.INDEX_MAX_FILES ?? 60)
// Ollama sérialise sur un modèle → un petit lot parallèle suffit (évite de le saturer).
const OLLAMA_BATCH_SIZE = Number(process.env.INDEX_BATCH_SIZE ?? 3)
const CONTENT_TRUNCATE = 2500

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
}

function loadIndex(): IndexStore {
  ensureDataDir()
  if (!fs.existsSync(INDEX_FILE)) return { entries: {} }
  try {
    const raw = fs.readFileSync(INDEX_FILE, 'utf-8')
    const parsed = JSON.parse(raw) as IndexStore
    return parsed && typeof parsed === 'object' && parsed.entries ? parsed : { entries: {} }
  } catch {
    return { entries: {} }
  }
}

function saveIndex(store: IndexStore): void {
  ensureDataDir()
  atomicWriteFileSync(INDEX_FILE, JSON.stringify(store, null, 2))
}

// Empreinte légère du contenu : taille + mtime (ms). Suffit pour détecter
// une modification et déclencher une ré-indexation incrémentale.
function fileHash(absPath: string): string {
  try {
    const st = fs.statSync(absPath)
    return `${st.size}-${Math.floor(st.mtimeMs)}`
  } catch {
    return ''
  }
}

// Liste tous les fichiers source de tous les projets (mêmes exclusions que /components).
interface ScannedFile {
  project: string
  file: string // relatif au projet, forward slash
  absPath: string
  category: FileCategory
}

function scanAllProjects(): ScannedFile[] {
  if (!fs.existsSync(WORKSPACE_DIR)) return []
  let projectDirs: fs.Dirent[]
  try {
    projectDirs = fs.readdirSync(WORKSPACE_DIR, { withFileTypes: true })
  } catch {
    return []
  }

  const all: ScannedFile[] = []
  for (const entry of projectDirs) {
    if (!entry.isDirectory() || isExcluded(entry.name)) continue
    const projectPath = path.join(WORKSPACE_DIR, entry.name)
    for (const relPath of findSourceFiles(projectPath)) {
      const fwd = relPath.replace(/\\/g, '/')
      all.push({
        project: entry.name,
        file: fwd,
        absPath: path.join(projectPath, relPath),
        category: inferCategory(relPath),
      })
    }
  }
  return all
}

// Demande à l'Élève local (Gemma via Ollama) un résumé ≤ 2 phrases en français.
// $0, souverain, hors crédits API. Fallback = 1re ligne non vide (degraded).
const SUMMARY_SYSTEM =
  'Tu résumes des fichiers de code en français, de façon concise et factuelle. Pas de markdown, pas de code, 2 phrases maximum.'

async function summarizeFile(f: ScannedFile): Promise<{ summary: string; degraded: boolean }> {
  let content = ''
  try {
    content = fs.readFileSync(f.absPath, 'utf-8')
  } catch {
    return { summary: '', degraded: true }
  }
  const snippet = content.slice(0, CONTENT_TRUNCATE)
  const firstLine = content.split('\n').map((l) => l.trim()).find(Boolean) ?? ''

  try {
    const provider = resolveProvider(process.env.INDEX_PROVIDER, 'ollama')
    const text = await getBrain().complete(SUMMARY_SYSTEM, `Résume ce fichier source (catégorie : ${f.category}) en français, en 2 phrases maximum, ` +
      `style « Ce ${f.category} fait X. Utile quand Y. ». Sois concis, pas de markdown, pas de code.\n\n` +
      `Fichier : ${f.project}/${f.file}\n\n` +
      '```\n' + snippet + '\n```', { provider, timeoutMs: 180_000 })
    if (text) {
      return { summary: text, degraded: false }
    } else {
      return { summary: firstLine, degraded: true }
    }
  } catch {
    // Provider injoignable/timeout : on retombe sur la 1re ligne (degraded), sans
    // interrompre le run. Le garde-fou re-tentera ce fichier au prochain run.
    return { summary: firstLine, degraded: true }
  }
}

// Scoring mots-clés (style topByKeyword) sur summary + file + project + category.
function topByKeyword(entries: IndexEntry[], query: string, limit = 15): Array<IndexEntry & { score: number }> {
  const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 2)
  if (words.length === 0) return []
  const scored = entries.map((e) => {
    const text = `${e.summary} ${e.file} ${e.project} ${e.category}`.toLowerCase()
    const score = words.reduce((acc, w) => acc + (text.includes(w) ? 1 : 0), 0)
    return { ...e, score }
  })
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

export function registerMultiProjectRoutes(app: Express): void {
  // GET /api/multi-project/components
  app.get('/api/multi-project/components', (_req: Request, res: Response) => {
    if (!fs.existsSync(WORKSPACE_DIR)) {
      res.json({ projects: [] })
      return
    }

    let projectDirs: fs.Dirent[]
    try {
      projectDirs = fs.readdirSync(WORKSPACE_DIR, { withFileTypes: true })
    } catch {
      res.json({ projects: [] })
      return
    }

    const projects = projectDirs
      .filter((entry) => entry.isDirectory() && !isExcluded(entry.name))
      .map((entry) => {
        const projectPath = path.join(WORKSPACE_DIR, entry.name)
        const fileRelPaths = findSourceFiles(projectPath)

        const components: SourceFile[] = fileRelPaths.map((relPath) => {
          const absPath = path.join(projectPath, relPath)
          let size = 0
          try {
            size = fs.statSync(absPath).size
          } catch {
            // ignorer
          }
          const preview = getPreview(absPath)
          const category = inferCategory(relPath)
          return {
            file: relPath.replace(/\\/g, '/'),
            size,
            preview,
            category,
          }
        })

        return {
          name: entry.name,
          componentCount: components.length,
          components,
        }
      })
      .filter((p) => p.componentCount > 0)

    res.json({ projects })
  })

  // GET /api/multi-project/file?project=X&file=Y
  app.get('/api/multi-project/file', (req: Request, res: Response) => {
    const { project, file } = req.query as { project?: string; file?: string }

    if (!project?.trim() || !file?.trim()) {
      res.status(400).json({ error: 'project et file sont requis' })
      return
    }

    // Sécurité : éviter path traversal
    const safeProjName = path.basename(project)
    const fileRelative = file.replace(/\\/g, '/').replace(/^\/+/, '')
    if (fileRelative.includes('..')) {
      res.status(400).json({ error: 'Chemin invalide' })
      return
    }

    const absPath = path.join(WORKSPACE_DIR, safeProjName, fileRelative)

    // Vérifier que le chemin reste dans workspace
    if (!absPath.startsWith(WORKSPACE_DIR)) {
      res.status(403).json({ error: 'Accès refusé' })
      return
    }

    if (!fs.existsSync(absPath)) {
      res.status(404).json({ error: 'Fichier introuvable' })
      return
    }

    try {
      const content = fs.readFileSync(absPath, 'utf-8')
      res.json({ content })
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) })
    }
  })

  // POST /api/multi-project/copy
  // Body: { sourceProject, sourceFile, targetProject, targetFile, overwrite? }
  app.post('/api/multi-project/copy', (req: Request, res: Response) => {
    const { sourceProject, sourceFile, targetProject, targetFile, overwrite } = req.body as {
      sourceProject?: string
      sourceFile?: string
      targetProject?: string
      targetFile?: string
      overwrite?: boolean
    }

    if (!sourceProject?.trim() || !sourceFile?.trim() || !targetProject?.trim() || !targetFile?.trim()) {
      res.status(400).json({ error: 'sourceProject, sourceFile, targetProject et targetFile sont requis' })
      return
    }

    const srcFileRel = sourceFile.replace(/\\/g, '/').replace(/^\/+/, '')
    const tgtFileRel = targetFile.replace(/\\/g, '/').replace(/^\/+/, '')

    if (srcFileRel.includes('..') || tgtFileRel.includes('..')) {
      res.status(400).json({ error: 'Chemin invalide' })
      return
    }

    const srcProjSafe = path.basename(sourceProject)
    const tgtProjSafe = path.basename(targetProject)

    const srcAbs = path.join(WORKSPACE_DIR, srcProjSafe, srcFileRel)
    const tgtAbs = path.join(WORKSPACE_DIR, tgtProjSafe, tgtFileRel)

    if (!srcAbs.startsWith(WORKSPACE_DIR) || !tgtAbs.startsWith(WORKSPACE_DIR)) {
      res.status(403).json({ error: 'Accès refusé' })
      return
    }

    if (!fs.existsSync(srcAbs)) {
      res.status(404).json({ error: 'Fichier source introuvable' })
      return
    }

    // Vérifier si la cible existe déjà
    if (fs.existsSync(tgtAbs) && !overwrite) {
      res.status(409).json({ exists: true, error: 'Le fichier cible existe déjà.' })
      return
    }

    try {
      // Créer le dossier cible si manquant
      const tgtDir = path.dirname(tgtAbs)
      fs.mkdirSync(tgtDir, { recursive: true })

      // Copier le fichier
      fs.copyFileSync(srcAbs, tgtAbs)

      res.json({ ok: true, target: tgtAbs })
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) })
    }
  })

  // POST /api/multi-project/index — (ré)indexation sémantique incrémentale
  app.post('/api/multi-project/index', async (_req: Request, res: Response) => {
    try {
      const store = loadIndex()
      const scanned = scanAllProjects()

      // Clés actuellement présentes sur disque
      const liveKeys = new Set(scanned.map((f) => `${f.project}/${f.file}`))

      // 1) Purge : retirer de l'index les fichiers qui n'existent plus
      let removed = 0
      for (const key of Object.keys(store.entries)) {
        if (!liveKeys.has(key)) {
          delete store.entries[key]
          removed++
        }
      }

      // 2) Déterminer ce qui doit être (ré)indexé (nouveau ou hash changé)
      const toIndex: ScannedFile[] = []
      let reused = 0
      for (const f of scanned) {
        const key = `${f.project}/${f.file}`
        const hash = fileHash(f.absPath)
        const existing = store.entries[key]
        if (existing && existing.hash === hash && existing.summary && !existing.degraded) {
          reused++
        } else {
          toIndex.push(f)
        }
      }

      // 3) Cap du run : prioriser les composants, puis le reste
      toIndex.sort((a, b) => {
        const ca = a.category === 'component' ? 0 : 1
        const cb = b.category === 'component' ? 0 : 1
        return ca - cb
      })
      const capped = toIndex.slice(0, MAX_FILES_PER_RUN)

      // 4) Résumés via l'Élève local (Gemma/Ollama) par petits lots
      let indexed = 0
      for (let i = 0; i < capped.length; i += OLLAMA_BATCH_SIZE) {
        const batch = capped.slice(i, i + OLLAMA_BATCH_SIZE)
        const results = await Promise.all(
          batch.map(async (f) => {
            const result = await summarizeFile(f) // try/catch interne
            return { f, result }
          })
        )
        for (const { f, result } of results) {
          const key = `${f.project}/${f.file}`
          store.entries[key] = {
            project: f.project,
            file: f.file,
            category: f.category,
            summary: result.summary,
            degraded: result.degraded,
            hash: fileHash(f.absPath),
            indexedAt: new Date().toISOString(),
          }
          indexed++
        }
      }

      saveIndex(store)

      res.json({
        ok: true,
        indexed,
        reused,
        total: Object.keys(store.entries).length,
        removed,
      })
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) })
    }
  })

  // GET /api/multi-project/search?q=... — recherche par mots-clés sur l'index
  app.get('/api/multi-project/search', (req: Request, res: Response) => {
    const q = (req.query.q as string | undefined)?.trim() ?? ''
    const store = loadIndex()
    const entries = Object.values(store.entries)

    if (entries.length === 0) {
      res.json({ results: [], needsIndex: true })
      return
    }

    if (!q) {
      res.json({ results: [] })
      return
    }

    const results = topByKeyword(entries, q).map((e) => ({
      project: e.project,
      file: e.file,
      category: e.category,
      summary: e.summary,
      score: e.score,
    }))

    res.json({ results })
  })
}
