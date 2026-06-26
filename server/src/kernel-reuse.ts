// MangoOS Kernel — Réinjection des composants & blueprints (#119, « de la même
// façon » que les artefacts design #118).
//
// #118 réinjecte les PALETTES proches de la cible avant un build. Ici on étend le
// principe aux deux autres bibliothèques réutilisables :
//   • COMPOSANTS (#36) — vraie bibliothèque qui grandit. Aujourd'hui le prompt
//     DUMPE tous les composants ; on les indexe dans le Blackboard (embedding
//     texte) et on ne réinjecte que les PLUS PERTINENTS à la tâche du tour.
//   • BLUEPRINTS (#8) — catalogue statique de 7 types. La « pertinence » = le type
//     inféré de la demande ; on rappelle le blueprint qui colle.
//
// Embedding texte best-effort via Ollama (comme notes-rag/procédures) avec REPLI
// MOTS-CLÉS déterministe → marche toujours, sans Ollama. L'embedder est injectable
// (tests déterministes). La recherche passe par le Blackboard #115 (cosinus).
import { listComponents, COMPONENTS_DIR_NAME, type ComponentMeta } from './components.js'
import { listLayouts, LAYOUTS_DIR_NAME, type LayoutMeta } from './layouts.js'
import { listSkills, type SkillMeta } from './skills.js'
import { getBlackboard, type Blackboard } from './kernel-blackboard.js'
import { embedOllama } from './ollama.js'
import { inferProjectType } from './blueprints.js'

export const COMPONENT_SCOPE = 'artifact:component'
export const LAYOUT_SCOPE = 'artifact:layout'
export const SKILL_SCOPE = 'artifact:skill'

export type Embed = (text: string) => Promise<number[]>

/** Embedder par défaut : Ollama, [] si indisponible (déclenche le repli mots-clés). */
const defaultEmbed: Embed = async (t) => {
  try {
    return await embedOllama(t)
  } catch {
    return []
  }
}

function componentText(c: ComponentMeta): string {
  return `${c.name}. ${c.description}. ${(c.tags ?? []).join(' ')} ${(c.props ?? []).join(' ')}`
}

// ── Repli mots-clés (déterministe, sans réseau) ──────────────────────────────
function tokenize(s: string): string[] {
  return (s.toLowerCase().match(/[a-zàâäéèêëîïôöùûüç0-9]+/g) ?? []).filter((t) => t.length >= 3)
}

/** Classe des items par chevauchement de tokens avec la requête (desc). Stable. */
export function keywordRank<T>(items: T[], textOf: (t: T) => string, query: string, k: number): T[] {
  const q = new Set(tokenize(query))
  if (q.size === 0) return items.slice(0, k)
  const scored = items.map((item, i) => {
    const toks = new Set(tokenize(textOf(item)))
    let overlap = 0
    for (const t of toks) if (q.has(t)) overlap++
    return { item, overlap, i }
  })
  scored.sort((a, b) => b.overlap - a.overlap || a.i - b.i) // stable : ordre d'origine à égalité
  return scored.slice(0, k).map((s) => s.item)
}

// ── Indexation des composants dans le Blackboard ─────────────────────────────
/** Indexe (ou met à jour) les composants dans le Blackboard avec leur embedding
 * texte. Idempotent : un composant inchangé (même updatedAt) n'est pas ré-embeddé. */
export async function indexComponents(workspaceDir: string, bb: Blackboard, embed: Embed): Promise<void> {
  for (const c of listComponents(workspaceDir)) {
    const existing = bb.get<ComponentMeta>(COMPONENT_SCOPE, c.name)
    if (existing && existing.updatedAt === c.updatedAt) continue
    const emb = await embed(componentText(c))
    bb.put(COMPONENT_SCOPE, c.name, c, emb.length ? emb : undefined)
  }
}

/** Les k composants les plus PERTINENTS à une requête (recherche sémantique
 * Blackboard si l'embedding marche, repli mots-clés déterministe sinon). Renvoie
 * les METAS (pas une section de prompt) → utilisable par l'outil `chercher_artefact`
 * de l'Élève (#156/L3). [] si la bibliothèque est vide. Ne lève jamais. */
export async function searchComponentsRanked(
  prompt: string,
  workspaceDir: string,
  opts: { bb?: Blackboard; embed?: Embed; k?: number } = {},
): Promise<ComponentMeta[]> {
  const all = listComponents(workspaceDir)
  if (all.length === 0) return []
  const bb = opts.bb ?? getBlackboard()
  const embed = opts.embed ?? defaultEmbed
  const k = opts.k ?? 6
  try {
    await indexComponents(workspaceDir, bb, embed)
    return await searchRanked(COMPONENT_SCOPE, all, componentText, prompt, bb, embed, k)
  } catch {
    // Tout échec (embedding, Blackboard) → repli mots-clés pur, jamais d'exception.
    return keywordRank(all, componentText, prompt, k)
  }
}

// ── Layouts : type DISTINCT (L3), même mécanique de tri ──────────────────────
function layoutText(l: LayoutMeta): string {
  return `${l.name}. ${l.description}. ${(l.tags ?? []).join(' ')} ${(l.structure ?? []).join(' ')}`
}

/** Indexe (ou met à jour) les layouts dans le Blackboard avec leur embedding texte.
 * Idempotent : un layout inchangé (même updatedAt) n'est pas ré-embeddé. */
export async function indexLayouts(workspaceDir: string, bb: Blackboard, embed: Embed): Promise<void> {
  for (const l of listLayouts(workspaceDir)) {
    const existing = bb.get<LayoutMeta>(LAYOUT_SCOPE, l.name)
    if (existing && existing.updatedAt === l.updatedAt) continue
    const emb = await embed(layoutText(l))
    bb.put(LAYOUT_SCOPE, l.name, l, emb.length ? emb : undefined)
  }
}

/** Les k LAYOUTS (agencements de page entiers) les plus PERTINENTS à une requête
 * texte (sémantique Blackboard, repli mots-clés). Renvoie les METAS → utilisable
 * par `chercher_artefact` (#156/L3). [] si la bibliothèque est vide. Ne lève jamais. */
export async function searchLayoutsRanked(
  prompt: string,
  workspaceDir: string,
  opts: { bb?: Blackboard; embed?: Embed; k?: number } = {},
): Promise<LayoutMeta[]> {
  const all = listLayouts(workspaceDir)
  if (all.length === 0) return []
  const bb = opts.bb ?? getBlackboard()
  const embed = opts.embed ?? defaultEmbed
  const k = opts.k ?? 6
  try {
    await indexLayouts(workspaceDir, bb, embed)
    return await searchRanked(LAYOUT_SCOPE, all, layoutText, prompt, bb, embed, k)
  } catch {
    return keywordRank(all, layoutText, prompt, k)
  }
}

function formatLayouts(list: LayoutMeta[]): string {
  const lines = list.map((l) => {
    const tagStr = l.tags?.length ? ` [${l.tags.join(', ')}]` : ''
    const structStr = l.structure?.length ? ` — sections: ${l.structure.join(' › ')}` : ''
    return `- **${l.name}**: ${l.description}${tagStr}${structStr}`
  })
  return (
    `\n\nLayouts de page réutilisables PERTINENTS (squelettes ; lis workspace/${LAYOUTS_DIR_NAME}/<Name>/layout.tsx ` +
    `et adapte la STRUCTURE) :\n` +
    lines.join('\n')
  )
}

/** Section de prompt : les k layouts les plus PERTINENTS à la tâche. "" si aucun.
 * Async (embedding best-effort) ; ne lève jamais. */
export async function relevantLayoutsSection(
  prompt: string,
  workspaceDir: string,
  opts: { bb?: Blackboard; embed?: Embed; k?: number } = {},
): Promise<string> {
  const all = listLayouts(workspaceDir)
  if (all.length === 0) return ''
  const bb = opts.bb ?? getBlackboard()
  const embed = opts.embed ?? defaultEmbed
  const k = opts.k ?? 6
  if (all.length <= k) return formatLayouts(all)
  await indexLayouts(workspaceDir, bb, embed)
  const ranked = await searchRanked(LAYOUT_SCOPE, all, layoutText, prompt, bb, embed, k)
  return formatLayouts(ranked)
}

// ── Cœur de tri PARTAGÉ (composants, layouts, skills) ─────────────────────────
/** La même mécanique pour toutes les bibliothèques texte : recherche sémantique
 * dans le Blackboard si la requête s'embed (cosinus #115), sinon repli mots-clés
 * déterministe. Top-k. C'est le « même mécanisme » qui unifie composants & skills
 * (les procédures #75 implémentent déjà l'équivalent sur leur store calibré). */
async function searchRanked<T>(
  scope: string,
  all: T[],
  textOf: (t: T) => string,
  prompt: string,
  bb: Blackboard,
  embed: Embed,
  k: number,
): Promise<T[]> {
  const qEmb = await embed(prompt)
  if (qEmb.length > 0) {
    const ranked = bb
      .search(scope, qEmb, k)
      .map((h) => h.value as T)
      .filter(Boolean)
    if (ranked.length > 0) return ranked.slice(0, k)
  }
  return keywordRank(all, textOf, prompt, k)
}

function formatComponents(list: ComponentMeta[]): string {
  const lines = list.map((c) => {
    const tagStr = c.tags?.length ? ` [${c.tags.join(', ')}]` : ''
    const propStr = c.props?.length ? ` — props: ${c.props.join(', ')}` : ''
    return `- **${c.name}**: ${c.description}${tagStr}${propStr}`
  })
  return (
    `\n\nComposants réutilisables PERTINENTS pour cette tâche (lis workspace/${COMPONENTS_DIR_NAME}/<Name>/component.tsx pour réutiliser) :\n` +
    lines.join('\n')
  )
}

/** Section de prompt : les k composants les plus PERTINENTS à la tâche du tour
 * (recherche sémantique Blackboard, repli mots-clés). "" s'il n'y a aucun
 * composant. Async (embedding best-effort) ; ne lève jamais. */
export async function relevantComponentsSection(
  prompt: string,
  workspaceDir: string,
  opts: { bb?: Blackboard; embed?: Embed; k?: number } = {},
): Promise<string> {
  const all = listComponents(workspaceDir)
  if (all.length === 0) return ''
  const bb = opts.bb ?? getBlackboard()
  const embed = opts.embed ?? defaultEmbed
  const k = opts.k ?? 8

  // Sous le seuil k, tout tient : on garde le dump complet (juste reformulé
  // « pertinents »), inutile d'embedder. Au-dessus, on trie par pertinence.
  if (all.length <= k) return formatComponents(all)

  await indexComponents(workspaceDir, bb, embed)
  const ranked = await searchRanked(COMPONENT_SCOPE, all, componentText, prompt, bb, embed, k)
  return formatComponents(ranked)
}

// ── Skills : même mécanisme que les composants (#119 → #120) ─────────────────
function skillText(s: SkillMeta): string {
  return `${s.name}. ${s.description}`
}

/** Indexe les skills dans le Blackboard (embedding texte best-effort). Les SkillMeta
 * n'ont pas d'horodatage → on indexe une fois (présence). Idempotent. */
export async function indexSkills(skills: SkillMeta[], bb: Blackboard, embed: Embed): Promise<void> {
  for (const s of skills) {
    if (bb.has(SKILL_SCOPE, s.name)) continue
    const emb = await embed(skillText(s))
    bb.put(SKILL_SCOPE, s.name, s, emb.length ? emb : undefined)
  }
}

function formatSkills(list: SkillMeta[]): string {
  const lines = list.map((s) => `- ${s.name}: ${s.description}\n  → ${s.file}`).join('\n')
  return (
    `\n\nLearned skills PERTINENTS pour cette tâche (how-to guides ; lis le SKILL.md ` +
    `et suis-le si l'un correspond) :\n` +
    lines
  )
}

/** Les k SKILLS (savoir-faire how-to) les plus PERTINENTS à une requête texte
 * (sémantique Blackboard, repli mots-clés). Renvoie les METAS → utilisable par
 * `chercher_artefact` (#156/L3). [] si la bibliothèque est vide. Ne lève jamais.
 * `skills` injectable pour les tests (défaut = listSkills()). */
export async function searchSkillsRanked(
  prompt: string,
  opts: { skills?: SkillMeta[]; bb?: Blackboard; embed?: Embed; k?: number } = {},
): Promise<SkillMeta[]> {
  const all = opts.skills ?? listSkills()
  if (all.length === 0) return []
  const bb = opts.bb ?? getBlackboard()
  const embed = opts.embed ?? defaultEmbed
  const k = opts.k ?? 6
  try {
    await indexSkills(all, bb, embed)
    return await searchRanked(SKILL_SCOPE, all, skillText, prompt, bb, embed, k)
  } catch {
    return keywordRank(all, skillText, prompt, k)
  }
}

/** Section de prompt : les k skills les plus PERTINENTS à la tâche (recherche
 * sémantique Blackboard, repli mots-clés). "" si aucun skill. `skills` injectable
 * pour les tests (défaut = listSkills() qui lit workspace/.skills). */
export async function relevantSkillsSection(
  prompt: string,
  opts: { skills?: SkillMeta[]; bb?: Blackboard; embed?: Embed; k?: number } = {},
): Promise<string> {
  const all = opts.skills ?? listSkills()
  if (all.length === 0) return ''
  const bb = opts.bb ?? getBlackboard()
  const embed = opts.embed ?? defaultEmbed
  const k = opts.k ?? 8
  if (all.length <= k) return formatSkills(all)

  await indexSkills(all, bb, embed)
  const ranked = await searchRanked(SKILL_SCOPE, all, skillText, prompt, bb, embed, k)
  return formatSkills(ranked)
}

// ── Blueprints : rappel du type pertinent ────────────────────────────────────
/** Section de prompt : rappelle le blueprint du TYPE détecté pour la demande.
 * "" si le type est « autre » (aucun blueprint dédié). Pur et synchrone. */
export function blueprintHintSection(prompt: string): string {
  const type = inferProjectType(prompt)
  if (type === 'autre') return ''
  return (
    `\n\n→ Type de projet détecté pour cette demande : **${type}**. ` +
    `Pars du blueprint « ${type} » ci-dessus (stack + arborescence) plutôt que d'improviser ; adapte si le projet l'exige.`
  )
}
