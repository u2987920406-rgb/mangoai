// Modele de donnees du Mango Command Center.
// Une "Idea" = une carte du board (une idee ou un chantier de MangoOS, #94 -> #143).

export type Status = 'idea' | 'doing' | 'blocked' | 'done'
export type ModelTier = 'haiku' | 'sonnet' | 'opus' | 'none' // ⚡ / ⚖️ / 🧠 / —
export type Effort = 'XS' | 'S' | 'M' | 'L' | 'XL' | 'none'

export interface Idea {
  id: number // le # de l'idee (ex. 137)
  title: string // titre COURT (<= ~80 car.)
  status: Status
  model: ModelTier
  effort: Effort
  tags: string[]
  deps: number[] // # des idees dont elle depend
  notes: string // markdown leger / texte
  updatedAt: number // Date.now()
}

// Journal de statut — la donnee qui compounde (chaque changement de colonne).
export interface HistoryEntry {
  id: number // # de l'idee concernee
  from: Status
  to: Status
  ts: number
}

// --- Referentiels d'affichage (palette + libelles) ---

export const STATUSES: Status[] = ['idea', 'doing', 'blocked', 'done']

export const STATUS_META: Record<Status, { label: string; emoji: string; empty: string }> = {
  idea: { label: 'Idees', emoji: '💡', empty: 'Aucune idee ici — capture la prochaine etincelle.' },
  doing: { label: 'En cours', emoji: '🔨', empty: 'Rien en chantier. Tire une idee vers la droite.' },
  blocked: { label: 'Bloque', emoji: '⛔', empty: 'Aucun blocage — la voie est libre.' },
  done: { label: 'Fait', emoji: '✅', empty: 'Pas encore de livraison. Ca viendra.' },
}

export const MODEL_META: Record<ModelTier, { label: string; emoji: string; short: string }> = {
  haiku: { label: 'Haiku 4.5', emoji: '⚡', short: 'Haiku' },
  sonnet: { label: 'Sonnet 4.6', emoji: '⚖️', short: 'Sonnet' },
  opus: { label: 'Opus 4.8', emoji: '🧠', short: 'Opus' },
  none: { label: 'Sans modele', emoji: '—', short: '—' },
}

export const EFFORTS: Effort[] = ['XS', 'S', 'M', 'L', 'XL', 'none']

// Poids d'effort pour les sommes par colonne (XS=1 ... XL=5, none=0).
export const EFFORT_WEIGHT: Record<Effort, number> = {
  XS: 1,
  S: 2,
  M: 3,
  L: 4,
  XL: 5,
  none: 0,
}

export const EFFORT_LABEL: Record<Effort, string> = {
  XS: 'XS · < ½ session',
  S: 'S · ½ a 1 session',
  M: 'M · 1 a 2 sessions',
  L: 'L · 2 a 4 sessions',
  XL: 'XL · 4+ sessions',
  none: '— sans estimation',
}

export type SortKey = 'id' | 'effort' | 'model' | 'updated'

export const SORT_META: Record<SortKey, string> = {
  id: 'Numero #',
  effort: 'Effort',
  model: 'Modele',
  updated: 'Mise a jour',
}
