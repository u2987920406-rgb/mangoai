// Délégation réelle (slice 2) — quand l'Élève bute (plateau-iterations), le Stratège ne
// se contente plus d'un nudge « décompose » : il IDENTIFIE le spécialiste forgé pertinent
// (matching par recouvrement de mots-clés tâche↔agent) et l'INVOQUE vraiment pour obtenir
// une analyse experte, réinjectée à l'Élève. Si aucun agent ne correspond → repli sur le
// nudge de décomposition (comportement actuel). Attaque directe de L35 / L48(b).
//
// Le matching est PUR et déterministe (testable sans réseau) ; l'invocation passe par
// runSpecialist (cerveau de l'agent, $0 si local). Tout est injectable pour les tests.

import {
  loadSpecialists as defaultLoad,
  runSpecialist as defaultRun,
  type SpecialistAgent,
} from "./specialist-agents.js"

// Mots vides FR/EN à ignorer dans le matching (bruit sans valeur discriminante).
const STOP = new Set<string>([
  "le", "la", "les", "un", "une", "des", "de", "du", "et", "ou", "à", "au", "aux", "en",
  "dans", "sur", "pour", "par", "avec", "sans", "que", "qui", "quoi", "dont", "ce", "cette",
  "ces", "son", "sa", "ses", "tu", "il", "elle", "on", "se", "ne", "pas", "plus", "est",
  "sont", "fait", "faire", "tout", "toute", "tous", "the", "a", "an", "of", "to", "and",
  "or", "in", "on", "for", "with", "app", "page", "site", "jeu", "code", "react",
])

/** Tokenise un texte en mots-clés significatifs (minuscule, sans accents, ≥3 lettres, hors STOP). */
export function tokenize(text: string): Set<string> {
  const norm = (text ?? "")
    .toLowerCase()
    .normalize("NFD").replace(new RegExp("[\\u0300-\\u036f]", "g"), "")
  const out = new Set<string>()
  for (const w of norm.split(/[^a-z0-9]+/)) {
    if (w.length >= 3 && !STOP.has(w)) out.add(w)
  }
  return out
}

/** Texte « recherchable » d'un agent : tags (pondérés ×2) + rôle + déclencheurs + lacune + nom. */
function agentText(a: SpecialistAgent): string {
  const tags = (a.tags ?? []).join(" ")
  return [tags, tags, a.role, a.triggers, a.lacune, a.name].join(" ")
}

/** Longueur du préfixe commun entre deux mots. */
function commonPrefix(a: string, b: string): number {
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  return i
}

/** Match TOLÉRANT (singulier/pluriel, conjugaison) : égal, préfixe de l'autre, ou ≥4 lettres
 *  de préfixe commun. Gère pdf/pdfs, image/images, scanné/scannées, extrais/extraction. */
function soft(a: string, b: string): boolean {
  return a === b || a.startsWith(b) || b.startsWith(a) || commonPrefix(a, b) >= 4
}

export interface SpecialistMatch {
  agent: SpecialistAgent
  score: number
}

/**
 * Choisit le spécialiste le plus pertinent pour un texte (tâche + blocage). PUR.
 * Score = nb de mots-clés partagés (tags comptés double via agentText). Renvoie le meilleur
 * au-dessus de `min` (défaut 2), sinon null. Ne lève jamais.
 */
export function pickSpecialist(
  specs: SpecialistAgent[],
  text: string,
  opts: { min?: number } = {},
): SpecialistMatch | null {
  const min = opts.min ?? 2
  const q = tokenize(text)
  if (q.size === 0) return null
  let best: SpecialistMatch | null = null
  for (const agent of specs ?? []) {
    const at = tokenize(agentText(agent))
    // Score = nb de mots-clés de la TÂCHE qui matchent (tolérant) ≥1 mot-clé de l'agent.
    let score = 0
    for (const w of q) {
      for (const a of at) { if (soft(w, a)) { score++; break } }
    }
    if (score >= min && (!best || score > best.score)) best = { agent, score }
  }
  return best
}

export interface ConsultResult {
  agent: SpecialistAgent
  advice: string
  score: number
}

/**
 * Consulte le spécialiste pertinent pour un blocage. Charge les agents, matche sur tâche+blocage,
 * et si un agent correspond, l'invoque pour obtenir une analyse CONCRÈTE. Renvoie null si aucun
 * match ou si l'invocation échoue/vide. Ne lève jamais. Dépendances injectables (tests).
 */
export async function consultSpecialist(
  args: { task: string; blockage: string; min?: number },
  deps: {
    load?: () => SpecialistAgent[]
    run?: (id: string, task: string) => Promise<{ ok: boolean; text: string }>
  } = {},
): Promise<ConsultResult | null> {
  const load = deps.load ?? defaultLoad
  const run = deps.run ?? ((id, t) => defaultRun(id, t))
  let specs: SpecialistAgent[]
  try {
    specs = load()
  } catch {
    return null
  }
  const match = pickSpecialist(specs, `${args.task} ${args.blockage}`, { min: args.min })
  if (!match) return null
  const subtask =
    `L'agent de build de Mango BUTE (${args.blockage}) sur cette tâche :\n"${(args.task ?? "").slice(0, 800)}"\n\n` +
    `En tant que ${match.agent.role}, donne des conseils CONCRETS, PRIORISÉS et BREFS pour débloquer ` +
    `et terminer (max ~8 points actionnables, pas de généralités).`
  let res: { ok: boolean; text: string }
  try {
    res = await run(match.agent.id, subtask)
  } catch (err) {
    return null
  }
  if (!res.ok || !res.text.trim()) return null
  return { agent: match.agent, advice: res.text.trim(), score: match.score }
}

/** Formate l'analyse d'un spécialiste en nudge réinjecté à l'Élève. */
export function buildDelegateNudge(agentName: string, advice: string): string {
  return (
    `🤝 STRATÈGE — j'ai consulté le spécialiste « ${agentName} » pour te débloquer. Son analyse :\n` +
    `${advice}\n` +
    `Applique ces points CONCRETS un par un, puis vérifie le build et appelle \`finish\`.`
  )
}

/** Nudge de REPRISE quand un agent vient d'être forgé mais que sa consultation (invocation
 *  du cerveau) échoue (hoquet cloud). On relance quand même avec le REMÈDE du diagnostic +
 *  la mention de l'agent, au lieu d'escalader — c'est ce qui ferme la boucle #168 en réel. */
export function buildForgedResumeNudge(agentName: string, blocker: string, remedy: string): string {
  return (
    `🧬 STRATÈGE — un spécialiste « ${agentName} » vient d'être créé pour ce blocage (${blocker}). ` +
    `Applique son remède : ${remedy}. Puis vérifie le build et appelle \`finish\`.`
  )
}
