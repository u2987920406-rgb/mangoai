// Idée #40 — Super-agent spécialisé : génère un agent expert complet depuis un domaine.
import type { Express, Request, Response } from 'express'
import { resolveProvider, claudeWebResearch } from './llm/llm-engine.js'
import { getBrain } from './kernel.js'
import path from 'node:path'
import fs from 'node:fs'
import { SKILLS_DIR } from './skills.js'
import { WORKSPACE_DIR } from './projects.js'
import { loadMemory } from './memory.js'
import { detectProjectType } from './blueprints.js'

const DATA_DIR = path.join(process.cwd(), '..', 'server', 'data')
const SUPER_AGENTS_FILE = path.join(DATA_DIR, 'super-agents.json')

export interface SuperAgentTool {
  name: string
  desc: string
}

export interface SuperAgent {
  id: string
  name: string
  domain: string
  systemPrompt: string
  tools: SuperAgentTool[]
  examples: string[]
  tags: string[]
  createdAt: string
}

function loadAgents(): SuperAgent[] {
  if (!fs.existsSync(SUPER_AGENTS_FILE)) return []
  try {
    return JSON.parse(fs.readFileSync(SUPER_AGENTS_FILE, 'utf-8')) as SuperAgent[]
  } catch {
    return []
  }
}

function saveAgents(agents: SuperAgent[]): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
  fs.writeFileSync(SUPER_AGENTS_FILE, JSON.stringify(agents, null, 2), 'utf-8')
}

function generateId(): string {
  return `sa_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Convertit un nom arbitraire en slug kebab-case ASCII sûr.
 * Seuls les caractères [a-z0-9-] sont conservés.
 * Protection contre le path traversal : aucun `.` ni `/` ne survit.
 */
function slugify(name: string): string {
  return name
    .normalize('NFD')                        // décompose les accents
    .replace(/[̀-ͯ]/g, '')         // supprime les diacritiques
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')            // remplace tout non-alphanum par tiret
    .replace(/^-+|-+$/g, '')                 // trim tirets bord
    .replace(/-{2,}/g, '-')                  // tirets consécutifs → un seul
    .slice(0, 80)                            // longueur max raisonnable
}

/** Aplatis une valeur multi-ligne sur une seule ligne pour le frontmatter YAML. */
function flatLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

// ── Phase 3 — Matching automatique agent ↔ projet ──────────────────────────
// Un super-agent est l'expert d'un DOMAINE MÉTIER (avocat, SEO, nutritionniste…).
// Le matching pertinent se fait sur le SUJET du projet — son nom + sa mémoire
// .memory.md — pas sur son type technique. On score chaque agent par recouvrement
// de mots-clés entre { name + domain + tags } et { nom projet + mémoire projet },
// à la manière de topByKeyword (notes-rag.ts) : mots > 2 chars, score par
// occurrence, mots vides ignorés. Bonus léger si detectProjectType correspond à
// un tag de l'agent. On ne retourne le meilleur agent que s'il dépasse un seuil
// minimal, pour éviter les faux positifs sur des projets sans expert dédié.

// Mots vides FR+EN courants : ignorés au scoring pour ne pas matcher sur du bruit.
const STOP_WORDS = new Set([
  'les', 'des', 'une', 'pour', 'avec', 'dans', 'sur', 'par', 'aux', 'que', 'qui',
  'est', 'son', 'ses', 'mes', 'tes', 'nos', 'vos', 'leur', 'leurs', 'ont', 'pas',
  'plus', 'mais', 'donc', 'car', 'comme', 'tout', 'tous', 'cette', 'ces', 'the',
  'and', 'for', 'with', 'this', 'that', 'are', 'from', 'you', 'your', 'app',
  'projet', 'project', 'site', 'page', 'web',
])

/** Découpe un texte en mots-clés significatifs (> 2 chars, sans accents, hors stop-words). */
function keywords(text: string): string[] {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w))
}

// Seuil minimal de recouvrement : en deçà, on considère qu'aucun expert ne
// correspond vraiment (≥ 2 mots-clés communs requis avant tout bonus).
const MATCH_THRESHOLD = 2

/**
 * Trouve le super-agent expert le plus pertinent pour un projet, ou `null`.
 * Score = nb de mots-clés de l'agent ({name + domain + tags}) présents dans le
 * texte du projet ({nom + mémoire .memory.md}), +1 si un tag de l'agent égale
 * le type de projet détecté. Retourne le meilleur strictement au-dessus du seuil.
 */
export function matchAgentToProject(
  projectName: string,
): { agent: SuperAgent; score: number } | null {
  const name = (projectName ?? '').trim()
  if (!name) return null

  const projectDir = path.join(WORKSPACE_DIR, path.basename(name))
  const memory = loadMemory(projectDir) // '' si absente
  const projectText = `${name} ${memory}`
  const projectWords = new Set(keywords(projectText))
  if (projectWords.size === 0) return null

  const detectedType = detectProjectType(name, memory) // 'dashboard' | 'jeu' | …

  let best: { agent: SuperAgent; score: number } | null = null
  for (const agent of loadAgents()) {
    const agentWords = keywords(`${agent.name} ${agent.domain} ${agent.tags.join(' ')}`)
    let score = agentWords.reduce((acc, w) => acc + (projectWords.has(w) ? 1 : 0), 0)
    // Bonus léger : un tag de l'agent recoupe le type technique détecté du projet.
    if (detectedType !== 'autre' && agent.tags.some((t) => keywords(t).includes(detectedType))) {
      score += 1
    }
    if (score >= MATCH_THRESHOLD && (!best || score > best.score)) {
      best = { agent, score }
    }
  }
  return best
}

/**
 * Section de system prompt injectant l'expertise du super-agent matché.
 * Retourne '' si aucun agent ne correspond (aucune pollution du prompt).
 * Le systemPrompt de l'agent est tronqué à ~1500 chars pour rester économe.
 */
export function superAgentPromptSection(projectName: string): string {
  const match = matchAgentToProject(projectName)
  if (!match) return ''

  const { agent } = match
  const MAX = 1500
  const expertise =
    agent.systemPrompt.length > MAX
      ? `${agent.systemPrompt.slice(0, MAX)}…`
      : agent.systemPrompt

  return `\n\n## Expert spécialisé actif (${agent.name})
Pour ce projet, adopte aussi l'expertise et les priorités de cet expert métier en ${agent.domain}. Applique son angle d'analyse, son vocabulaire et ses standards lorsque c'est pertinent pour la tâche — sans jamais sortir de ton rôle d'ingénieur qui construit l'app :
${expertise}`
}

export function registerSuperAgentRoutes(app: Express): void {

  // POST /api/super-agent/build
  app.post('/api/super-agent/build', async (req: Request, res: Response) => {
    const { domain, description } = req.body as { domain?: string; description?: string }

    if (!domain?.trim()) {
      res.status(400).json({ error: 'Le champ "domain" est requis.' })
      return
    }

    const descriptionBlock = description?.trim()
      ? `\n\nContexte supplémentaire fourni par l'utilisateur :\n${description.trim()}`
      : ''

    // ── Étape 1 — Recherche web via l'ABONNEMENT (query + WebSearch) ───────────
    // $0 crédit, mais plus lent (~1 min : vraie recherche web multi-tours).
    // Fallback gracieux : si indisponible (réseau, abonnement…), on génère sans
    // contexte web (webContext reste '').
    let webContext = ''
    try {
      webContext = await claudeWebResearch(
        `Recherche les meilleures pratiques, le vocabulaire métier et le mode de raisonnement d'un expert en : ${domain.trim()}. Synthétise en 8-12 puces concrètes et opérationnelles.`,
      )
    } catch {
      webContext = ''
    }

    // ── Étape 2 — Génération de l'agent ──────────────────────────────────────
    const webContextBlock = webContext.trim()
      ? `\nContexte web récent sur le domaine (à utiliser pour ancrer le system prompt dans des pratiques réelles) :\n<webContext>\n${webContext.trim()}\n</webContext>\n`
      : ''

    const systemPrompt = `Tu es un architecte d'agents IA. Tu génères des agents experts hautement opérationnels.`

    const userPrompt = `Génère un agent expert spécialisé en : ${domain.trim()}.${descriptionBlock}
${webContextBlock}
Retourne UNIQUEMENT un objet JSON valide (sans markdown, sans explication, sans code fence) avec exactement ces clés :

{
  "name": "Nom court et évocateur de l'agent (ex: LexWork Pro)",
  "systemPrompt": "System prompt très opérationnel, minimum 200 mots. Décrit la personnalité, les règles strictes de l'agent, ses limites, son style de réponse, ses priorités et ses biais. Il doit pouvoir être copié-collé directement dans un système IA.",
  "tools": [
    { "name": "nom_outil", "desc": "Description courte de l'outil et pourquoi l'agent l'utilise" }
  ],
  "examples": [
    "Exemple de prompt type 1 que l'utilisateur peut poser à cet agent",
    "Exemple de prompt type 2",
    "Exemple de prompt type 3"
  ],
  "tags": ["tag1", "tag2", "tag3"]
}

Règles :
- Le systemPrompt doit faire minimum 200 mots, être très concret et opérationnel
- Les tools doivent être pertinents pour le domaine (3 à 6 outils)
- Les examples doivent être des vraies questions utiles, pas des généralités
- Les tags décrivent le domaine et les cas d'usage (3 à 5 tags)`

    try {
      const provider = resolveProvider(process.env.SUPERAGENT_PROVIDER, 'claude')
      const rawText = await getBrain().complete(systemPrompt, userPrompt, { provider, maxTokens: 2048 })

      // Extraire le JSON même si Claude entoure d'un code fence
      const jsonMatch = rawText.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        res.status(502).json({ error: 'Claude n\'a pas retourné de JSON valide.', raw: rawText })
        return
      }

      let parsed: { name?: string; systemPrompt?: string; tools?: SuperAgentTool[]; examples?: string[]; tags?: string[] }
      try {
        parsed = JSON.parse(jsonMatch[0])
      } catch (e) {
        res.status(502).json({ error: 'Impossible de parser la réponse JSON.', raw: rawText })
        return
      }

      if (!parsed.name || !parsed.systemPrompt || !Array.isArray(parsed.tools) || !Array.isArray(parsed.examples)) {
        res.status(502).json({ error: 'Structure JSON incomplète.', parsed })
        return
      }

      const agent: SuperAgent = {
        id: generateId(),
        name: parsed.name,
        domain: domain.trim(),
        systemPrompt: parsed.systemPrompt,
        tools: parsed.tools ?? [],
        examples: parsed.examples ?? [],
        tags: parsed.tags ?? [],
        createdAt: new Date().toISOString(),
      }

      const agents = loadAgents()
      agents.push(agent)
      saveAgents(agents)

      res.json({ agent })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      res.status(500).json({ error: `Erreur lors de la génération : ${msg}` })
    }
  })

  // GET /api/super-agent/list
  app.get('/api/super-agent/list', (_req: Request, res: Response) => {
    const agents = loadAgents()
    res.json({ agents })
  })

  // GET /api/super-agent/match?project=X — quel expert correspond au projet ?
  // Ne renvoie PAS le systemPrompt à l'UI : juste de quoi afficher le badge.
  app.get('/api/super-agent/match', (req: Request, res: Response) => {
    const project = (req.query.project as string | undefined)?.trim() ?? ''
    const match = matchAgentToProject(project)
    res.json({
      match: match
        ? { id: match.agent.id, name: match.agent.name, domain: match.agent.domain, score: match.score }
        : null,
    })
  })

  // POST /api/super-agent/:id/export — exporte l'agent en SKILL.md dans workspace/.skills/
  app.post('/api/super-agent/:id/export', (req: Request, res: Response) => {
    const { id } = req.params
    const agents = loadAgents()
    const agent = agents.find((a) => a.id === id)
    if (!agent) {
      res.status(404).json({ error: `Agent "${id}" introuvable.` })
      return
    }

    // Calcul du slug : dériver du nom, fallback sur l'id si vide après nettoyage
    let slug = slugify(agent.name)
    if (!slug) slug = agent.id.replace(/[^a-z0-9-]/gi, '-').toLowerCase()

    // Sécurité path traversal : vérification finale — slug ne doit contenir que [a-z0-9-]
    if (!/^[a-z0-9-]+$/.test(slug)) {
      res.status(400).json({ error: `Slug invalide dérivé du nom : "${slug}"` })
      return
    }

    const skillDir = path.join(SKILLS_DIR, slug)
    const skillFile = path.join(skillDir, 'SKILL.md')
    const metaFile = path.join(skillDir, 'META.json')

    try {
      fs.mkdirSync(skillDir, { recursive: true })

      // ── Construction du SKILL.md ──────────────────────────────────────────
      // Le frontmatter DOIT commencer par `---` + newline exactement,
      // sans rien avant, pour être parsé par listSkills() dans skills.ts.
      const nameOneLine = flatLine(agent.name)
      const descOneLine = flatLine(`Expert ${agent.domain} — ${agent.systemPrompt.slice(0, 100)}`)

      const toolsSection = agent.tools.length > 0
        ? agent.tools.map((t) => `- **${t.name}** : ${t.desc}`).join('\n')
        : '_Aucun outil spécifique._'

      const examplesSection = agent.examples.length > 0
        ? agent.examples.map((ex) => `- ${ex}`).join('\n')
        : '_Aucun exemple._'

      const tagsSection = agent.tags.length > 0
        ? agent.tags.map((t) => `\`${t}\``).join(', ')
        : '_Aucun tag._'

      const skillMd = [
        '---',
        `name: ${nameOneLine}`,
        `description: ${descOneLine.slice(0, 240)}`,
        '---',
        '',
        `# ${agent.name}`,
        '',
        `> Agent expert spécialisé en **${agent.domain}**, généré par MangoOS le ${new Date(agent.createdAt).toLocaleDateString('fr-FR')}.`,
        '',
        '## System Prompt',
        '',
        agent.systemPrompt,
        '',
        '## Outils recommandés',
        '',
        toolsSection,
        '',
        '## Exemples de prompts',
        '',
        examplesSection,
        '',
        '## Tags',
        '',
        tagsSection,
        '',
      ].join('\n')

      fs.writeFileSync(skillFile, skillMd, 'utf-8')

      // ── META.json (inerte pour skills.ts, utile pour la traçabilité) ──────
      const meta = {
        name: agent.name,
        domain: agent.domain,
        tags: agent.tags,
        sourceId: agent.id,
        createdAt: agent.createdAt,
        exportedAt: new Date().toISOString(),
      }
      fs.writeFileSync(metaFile, JSON.stringify(meta, null, 2), 'utf-8')

      res.json({
        ok: true,
        slug,
        path: skillFile.replace(/\\/g, '/'),
        skillDir: skillDir.replace(/\\/g, '/'),
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      res.status(500).json({ error: `Erreur lors de l'export du skill : ${msg}` })
    }
  })

  // PUT /api/super-agent/:id — mise à jour partielle d'un agent existant
  app.put('/api/super-agent/:id', (req: Request, res: Response) => {
    const { id } = req.params
    const agents = loadAgents()
    const agent = agents.find((a) => a.id === id)
    if (!agent) {
      res.status(404).json({ error: `Agent "${id}" introuvable.` })
      return
    }

    const { name, domain, systemPrompt, tools, examples, tags } = req.body as {
      name?: unknown
      domain?: unknown
      systemPrompt?: unknown
      tools?: unknown
      examples?: unknown
      tags?: unknown
    }

    // Mise à jour partielle : seuls les champs fournis et valides sont appliqués.
    // id et createdAt sont immuables.
    if (name !== undefined) {
      if (typeof name !== 'string' || !name.trim()) {
        res.status(400).json({ error: '"name" doit être une chaîne non vide.' })
        return
      }
      agent.name = name.trim()
    }

    if (domain !== undefined) {
      if (typeof domain !== 'string' || !domain.trim()) {
        res.status(400).json({ error: '"domain" doit être une chaîne non vide.' })
        return
      }
      agent.domain = domain.trim()
    }

    if (systemPrompt !== undefined) {
      if (typeof systemPrompt !== 'string' || !systemPrompt.trim()) {
        res.status(400).json({ error: '"systemPrompt" doit être une chaîne non vide.' })
        return
      }
      agent.systemPrompt = systemPrompt.trim()
    }

    if (tools !== undefined) {
      if (!Array.isArray(tools)) {
        res.status(400).json({ error: '"tools" doit être un tableau.' })
        return
      }
      agent.tools = tools as SuperAgentTool[]
    }

    if (examples !== undefined) {
      if (!Array.isArray(examples)) {
        res.status(400).json({ error: '"examples" doit être un tableau.' })
        return
      }
      agent.examples = examples as string[]
    }

    if (tags !== undefined) {
      if (!Array.isArray(tags)) {
        res.status(400).json({ error: '"tags" doit être un tableau.' })
        return
      }
      agent.tags = tags as string[]
    }

    saveAgents(agents)
    res.json({ agent })
  })

  // DELETE /api/super-agent/:id
  app.delete('/api/super-agent/:id', (req: Request, res: Response) => {
    const { id } = req.params
    const agents = loadAgents()
    const idx = agents.findIndex((a) => a.id === id)
    if (idx === -1) {
      res.status(404).json({ error: `Agent "${id}" introuvable.` })
      return
    }
    agents.splice(idx, 1)
    saveAgents(agents)
    res.json({ ok: true })
  })
}
