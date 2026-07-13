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
  recordSpecialistConsulted as defaultRecordConsulted,
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

/** Texte « recherchable » de CONTEXTE d'un agent (poids 1, hors tags) : rôle + déclencheurs
 *  + lacune + nom. Les tags sont scorés séparément par rang (voir `tagWeight`). */
function agentContextText(a: SpecialistAgent): string {
  return [a.role, a.triggers, a.lacune, a.name].join(" ")
}

// (2026-07-13, demande Raf) — poids par RANG du tag, comme une liste d'ingrédients ordonnée
// par proportion (le 1er tag d'un agent = son ingrédient dominant). Un agent forgé doit lister
// ses tags du plus définissant au moins définissant (voir buildForgeOnePrompt) ; les tags au-
// delà du 3e rang, et les mots de contexte (rôle/déclencheurs/lacune/nom), pèsent 1 (poids
// historique). Permet à UN tag n°1 net (ex. "unity") de trancher entre deux agents proches
// plutôt que de compter chaque mot-clé à égalité.
const TAG_RANK_WEIGHTS = [3, 2, 1.5] as const
function tagWeight(rank: number): number {
  return TAG_RANK_WEIGHTS[rank] ?? 1
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

export interface PickSpecialistOptions {
  min?: number
  /** (2026-07-07, revue Fable — recommandation #3, axiome 11) Winrate minimal en dessous
   *  duquel un agent est IGNORÉ par le matching — mais seulement après `minUsesForFilter`
   *  consultations (sinon un agent tout juste forgé, avec 0 ou 1 essai malchanceux, serait
   *  blacklisté à tort sur un échantillon non significatif). 0/absent = filtre désactivé. */
  minWinrate?: number
  minUsesForFilter?: number
}

/**
 * Choisit le spécialiste le plus pertinent pour un texte (tâche + blocage). PUR.
 * Le SEUIL `min` reste basé sur le nombre BRUT de mots-clés de la tâche qui trouvent un
 * recouvrement (comportement historique, inchangé — évite qu'un seul mot fortuit déclenche
 * une délégation). Le CLASSEMENT entre agents éligibles, lui, utilise le score PONDÉRÉ par
 * rang de tag (`tagWeight`) : un agent dont le tag n°1 matche l'emporte sur un agent qui ne
 * matche que des mots de contexte génériques, même à recouvrement brut égal. Ignore les
 * agents sous le winrate minimal (#3) une fois qu'ils ont assez d'usages pour être
 * significatifs. Ne lève jamais.
 */
export function pickSpecialist(
  specs: SpecialistAgent[],
  text: string,
  opts: PickSpecialistOptions = {},
): SpecialistMatch | null {
  const min = opts.min ?? 2
  const minWinrate = opts.minWinrate ?? 0
  const minUsesForFilter = opts.minUsesForFilter ?? 4
  const q = tokenize(text)
  if (q.size === 0) return null
  let best: SpecialistMatch | null = null
  for (const agent of specs ?? []) {
    const stats = agent.stats
    if (minWinrate > 0 && stats && stats.consulted >= minUsesForFilter) {
      const winrate = stats.consulted > 0 ? stats.wins / stats.consulted : 1
      if (winrate < minWinrate) continue // agent mesuré peu utile → ignoré par le matching
    }
    const tags = agent.tags ?? []
    const tagTokensByRank = tags.map((tag) => tokenize(tag))
    const ctxTokens = tokenize(agentContextText(agent))
    // Pour chaque mot de la TÂCHE : le meilleur poids qu'il obtient chez cet agent (tag de
    // rang le plus haut qui matche, sinon 1 si seul le contexte matche, sinon 0).
    let raw = 0
    let weighted = 0
    for (const w of q) {
      let hit = 0
      tagTokensByRank.forEach((toks, rank) => {
        for (const t of toks) { if (soft(w, t)) hit = Math.max(hit, tagWeight(rank)) }
      })
      if (hit === 0) {
        for (const c of ctxTokens) { if (soft(w, c)) { hit = 1; break } }
      }
      if (hit > 0) { raw++; weighted += hit }
    }
    if (raw >= min && (!best || weighted > best.score)) best = { agent, score: weighted }
  }
  return best
}

export interface ConsultResult {
  agent: SpecialistAgent
  advice: string
  score: number
}

// (2026-07-07, revue Fable — recommandation #4, 4ᵉ instance du motif « le juge répond
// mais hors-format, jamais marqué, compté comme un vrai résultat » trouvé cette même
// session (taste-judge.ts/eleve-judge.ts/savoir-reconcile.ts). La plupart des systemPrompts
// forgés se terminent par « réponds STRICTEMENT en JSON » — mais consultSpecialist demande
// une PROSE de conseil (« ~8 points actionnables »). Conflit d'instructions non détecté
// jusqu'ici : un blob JSON, un refus, ou une réponse trop courte étaient tous injectés
// verbatim dans le nudge de l'Élève comme si c'était un avis exploitable.
const REFUSAL_HINTS = [/je ne peux pas/i, /désolé/i, /\bdesole\b/i, /in order to/i, /as an ai/i, /je ne suis pas en mesure/i]
const MIN_ADVICE_CHARS = 20

/** Une réponse de spécialiste est-elle EXPLOITABLE comme conseil ? PUR. En mode "action"
 *  (le spécialiste résume une exécution, pas un avis de conseil), seuls le refus et la
 *  longueur minimale sont vérifiés — le format JSON n'a pas de sens à y interdire. */
export function isUsableAdvice(
  text: string,
  mode: "conseil" | "action" = "conseil",
): { usable: boolean; reason?: string } {
  const t = (text ?? "").trim()
  if (!t) return { usable: false, reason: "réponse vide" }
  if (mode === "conseil" && /^[{[][\s\S]*[}\]]$/.test(t)) {
    try {
      JSON.parse(t)
      return { usable: false, reason: "réponse JSON pure en mode conseil (hors-format, probablement son format habituel plutôt qu'un conseil)" }
    } catch {
      // pas du JSON valide malgré l'allure — laisse passer aux vérifications suivantes
    }
  }
  if (REFUSAL_HINTS.some((re) => re.test(t))) return { usable: false, reason: "refus détecté dans la réponse" }
  if (t.length < MIN_ADVICE_CHARS) return { usable: false, reason: "réponse trop courte pour être un conseil exploitable" }
  return { usable: true }
}

/**
 * Consulte le spécialiste pertinent pour un blocage. Charge les agents, matche sur tâche+blocage,
 * et si un agent correspond, l'invoque pour obtenir une analyse CONCRÈTE. Renvoie null si aucun
 * match ou si l'invocation échoue/vide. Ne lève jamais. Dépendances injectables (tests).
 */
export async function consultSpecialist(
  args: { task: string; blockage: string; min?: number; minWinrate?: number; minUsesForFilter?: number },
  deps: {
    load?: () => SpecialistAgent[]
    run?: (id: string, task: string) => Promise<{ ok: boolean; text: string }>
    // #175 — runner AGENTIQUE (le spécialiste AGIT au lieu de conseiller). Fourni/câblé
    // seulement quand ELEVE_DELEGATE_AGENTIC=on ; absent → on reste sur le conseil (`run`).
    runAgentic?: (id: string, task: string) => Promise<{ ok: boolean; text: string }>
    /** (revue Fable #3) Comptabilise la consultation dans la scorecard de l'agent — appelé
     *  dès qu'une réponse EXPLOITABLE en sort (pas sur muet/erreur). Injectable pour les tests. */
    recordConsulted?: (id: string) => void
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
  const match = pickSpecialist(specs, `${args.task} ${args.blockage}`, {
    min: args.min, minWinrate: args.minWinrate, minUsesForFilter: args.minUsesForFilter,
  })
  if (!match) return null
  // #175 — un agent forgé en mode "action" EXÉCUTE le sous-problème (boucle agentique scellée)
  // quand le câblage agentique est fourni ; sinon il CONSEILLE (avis texte), comportement
  // historique. Le prompt diffère : « agis directement » vs « donne des conseils ».
  const useAgentic = match.agent.mode === "action" && !!deps.runAgentic
  const head = `L'agent de build de Mango BUTE (${args.blockage}) sur cette tâche :\n"${(args.task ?? "").slice(0, 800)}"\n\n`
  const subtask = useAgentic
    ? head +
      `En tant que ${match.agent.role}, RÉSOUS ce sous-problème DIRECTEMENT : lis les fichiers concernés, ` +
      `écris/édite le code nécessaire, vérifie le build, puis appelle finish avec un bref compte-rendu. ` +
      `Reste STRICTEMENT dans ton périmètre (n'entreprends rien au-delà de ce blocage).`
    : head +
      `En tant que ${match.agent.role}, donne des conseils CONCRETS, PRIORISÉS et BREFS pour débloquer ` +
      `et terminer (max ~8 points actionnables, pas de généralités).`
  let res: { ok: boolean; text: string }
  try {
    res = await (useAgentic ? deps.runAgentic! : run)(match.agent.id, subtask)
  } catch (err) {
    return null
  }
  if (!res.ok || !res.text.trim()) return null
  // (revue Fable #3) La consultation a produit UNE réponse (pas un muet/erreur, déjà écarté
  // ci-dessus) → elle compte dans la scorecard, exploitable ou non — un agent qui répond
  // hors-format à répétition doit voir son winrate baisser, pas être traité comme "jamais
  // essayé". `wins` (lui) n'est incrémenté qu'en cas de succès réel, ailleurs (eleve.ts).
  const recordConsulted = deps.recordConsulted ?? defaultRecordConsulted
  try { recordConsulted(match.agent.id) } catch { /* la scorecard ne casse jamais une délégation */ }
  const usability = isUsableAdvice(res.text, match.agent.mode ?? "conseil")
  if (!usability.usable) return null
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
