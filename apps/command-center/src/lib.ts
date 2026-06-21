import type { Idea, SortKey, Status } from './types'
import { EFFORT_WEIGHT } from './types'

// Date relative en francais ("il y a 3 j", "aujourd'hui"...).
export function relativeDate(ts: number): string {
  const diff = Date.now() - ts
  const day = 86_400_000
  if (diff < 0) return 'a venir'
  if (diff < day) return "aujourd'hui"
  if (diff < 2 * day) return 'hier'
  const days = Math.floor(diff / day)
  if (days < 30) return `il y a ${days} j`
  const months = Math.floor(days / 30)
  if (months < 12) return `il y a ${months} mois`
  const years = Math.floor(months / 12)
  return `il y a ${years} an${years > 1 ? 's' : ''}`
}

// Tri d'une liste d'idees selon une cle (copie, ne mute pas).
const MODEL_ORDER: Record<string, number> = { opus: 0, sonnet: 1, haiku: 2, none: 3 }

export function sortIdeas(ideas: Idea[], key: SortKey): Idea[] {
  const out = [...ideas]
  switch (key) {
    case 'id':
      return out.sort((a, b) => a.id - b.id)
    case 'effort':
      return out.sort((a, b) => EFFORT_WEIGHT[b.effort] - EFFORT_WEIGHT[a.effort] || a.id - b.id)
    case 'model':
      return out.sort((a, b) => MODEL_ORDER[a.model] - MODEL_ORDER[b.model] || a.id - b.id)
    case 'updated':
      return out.sort((a, b) => b.updatedAt - a.updatedAt)
  }
}

export function effortSum(ideas: Idea[]): number {
  return ideas.reduce((s, i) => s + EFFORT_WEIGHT[i.effort], 0)
}

// Parse "tag1, tag2 ,tag3" -> ["tag1","tag2","tag3"] (dedup, sans vides).
export function parseCsv(raw: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of raw.split(',')) {
    const t = part.trim()
    if (t && !seen.has(t.toLowerCase())) {
      seen.add(t.toLowerCase())
      out.push(t)
    }
  }
  return out
}

export function parseDeps(raw: string): number[] {
  const seen = new Set<number>()
  const out: number[] = []
  for (const part of raw.split(',')) {
    const n = parseInt(part.trim().replace(/^#/, ''), 10)
    if (!Number.isNaN(n) && !seen.has(n)) {
      seen.add(n)
      out.push(n)
    }
  }
  return out
}

// Idees "pretes a demarrer" : statut idea + toutes les deps existantes sont done.
// Une dep qui ne correspond a aucune carte connue est ignoree (consideree satisfaite).
export function readyToStart(ideas: Idea[]): Idea[] {
  const byId = new Map(ideas.map((i) => [i.id, i]))
  return ideas.filter((i) => {
    if (i.status !== 'idea') return false
    return i.deps.every((d) => {
      const dep = byId.get(d)
      return !dep || dep.status === 'done'
    })
  })
}

// Ce que cette carte DEBLOQUE (les cartes qui la listent en dep).
export function unlocks(ideas: Idea[], id: number): Idea[] {
  return ideas.filter((i) => i.deps.includes(id))
}

export function nextId(ideas: Idea[]): number {
  return ideas.reduce((max, i) => Math.max(max, i.id), 0) + 1
}

export function emptyIdea(id: number): Idea {
  return {
    id,
    title: '',
    status: 'idea',
    model: 'sonnet',
    effort: 'M',
    tags: [],
    deps: [],
    notes: '',
    updatedAt: Date.now(),
  }
}

export function byStatus(ideas: Idea[], status: Status): Idea[] {
  return ideas.filter((i) => i.status === status)
}
