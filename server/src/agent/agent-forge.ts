// La Forge (mécanisme) — Mango LIT ses propres lacunes et RÉDIGE, via GLM, des specs
// d'agents spécialisés pour les combler. C'est le cœur de la demande de Raf : « c'est
// MANGO qui crée ses agents via GLM ».
//
// Pipeline : readLacunesDigest() (limites.md ouvertes + capabilities.ts) → buildForgeOnePrompt(n)
// → cerveau `forgeron` [Opus, le meilleur raisonneur — décision Raf 2026-06-29] → parseForgedAgent()
// → validateSpec() → assignBrain() [cerveau adapté par compétence, jamais gemma seul]
// → upsertSpecialists() (persisté). Le tout INJECTABLE (ask) pour des tests sans réseau,
// et NE LÈVE JAMAIS (toute erreur → liste vide + message).

import fs from "node:fs"
import path from "node:path"
import { askLLM, type LLMProvider } from "../llm/llm-engine.js"
import { getBrain } from "../brain/brain-registry.js"
import { MANGOOS_CANNOT } from "../capabilities.js"
import {
  validateSpec,
  upsertSpecialists,
  loadSpecialists,
  type SpecialistAgent,
} from "../specialist/specialist-agents.js"
import { coversGap, type OpenGap } from "../self/self-evolution.js"
// Type-only (effacé à la compilation) → aucun cycle runtime avec eleve-action-tools.
import type { ToolPolicy } from "../eleve-tools/eleve-action-tools.js"

/** Chemin du registre des limites, surchargeable par env (testabilité).
 *  (2026-07-13, trouvé en testant le Forgeron en réel sur l'Élève) — BUG pré-existant :
 *  `import.meta.dirname` de ce module (server/src/agent/) ne remonte qu'à `server/`
 *  avec 2 `..`, or `limites.md` est à la RACINE du repo (un niveau plus haut). Résultat :
 *  `readLacunesDigest()` ne trouvait JAMAIS le fichier depuis TOUJOURS (fail-open silencieux
 *  → 0 lacune, jamais un crash) — le Forgeron (et forgeForGap en auto-évolution live)
 *  choisissait donc systématiquement "librement" au lieu de cibler une vraie lacune ouverte. */
function limitesFile(): string {
  return process.env.LIMITES_FILE
    ?? path.join(import.meta.dirname, "..", "..", "..", "limites.md")
}

/** Une lacune extraite du registre, sous forme compacte. */
export interface Lacune {
  id: string
  titre: string
  bloque: string
}

/**
 * Parse `limites.md` et renvoie les lignes encore OUVERTES (statut 🟡), avec L-id, titre
 * et opération bloquée. PUR sur le contenu passé (séparé pour les tests). Ne lève jamais.
 */
export function parseLacunes(markdown: string): Lacune[] {
  const out: Lacune[] = []
  for (const line of (markdown ?? "").split("\n")) {
    if (!line.startsWith("| L")) continue
    const cells = line.split("|").map((c) => c.trim())
    // cells[0] = "" (avant le 1er |). Colonnes : [ , id, limite, chantier, bloque, …, statut]
    const id = cells[1] ?? ""
    if (!/^L\d+$/.test(id)) continue
    const statut = cells[cells.length - 2] ?? "" // dernière cellule avant le | de fin
    // On ne garde QUE l'ouvert (🟡). On écarte ✅ Résolu / 🟢 Contournée·Assumé.
    if (!statut.includes("🟡")) continue
    out.push({
      id,
      titre: (cells[2] ?? "").slice(0, 160),
      bloque: (cells[4] ?? "").slice(0, 200),
    })
  }
  return out
}

/** Lit le registre des lacunes depuis disque (best-effort). Ne lève jamais. */
export function readLacunesDigest(): { lacunes: Lacune[]; text: string } {
  let md = ""
  try {
    md = fs.readFileSync(limitesFile(), "utf8")
  } catch {
    md = ""
  }
  const lacunes = parseLacunes(md)
  const lines = lacunes.map((l) => `- ${l.id} — ${l.titre} (bloque : ${l.bloque})`)
  const cannot = MANGOOS_CANNOT.map((c) => `- HORS PÉRIMÈTRE : ${c}`)
  const text = [
    "LACUNES OUVERTES DE MANGO (registre des limites honnêtes) :",
    ...lines,
    "",
    "FRONTIÈRE DE COMPÉTENCES (ce que Mango ne sait pas faire) :",
    ...cannot,
  ].join("\n")
  return { lacunes, text }
}

export const FORGE_SYSTEM = `Tu es l'ARCHITECTE D'AGENTS de Mango (un atelier d'IA qui génère des apps web).
Ta mission : concevoir des AGENTS SPÉCIALISÉS sur mesure pour combler les LACUNES de Mango.
Chaque agent est un cerveau-expert avec un rôle pointu, un prompt système opérationnel et des
capacités décrites. Tu raisonnes en ingénieur : un agent = une lacune précise traitée à fond.
Tu réponds UNIQUEMENT par un objet JSON valide, sans aucun texte autour.`

/** Construit le prompt de forge pour UN agent ciblant une lacune (réponse courte = jamais
 *  tronquée). `exclude` = noms déjà forgés, pour garantir la diversité. */
export function buildForgeOnePrompt(digest: string, focus: Lacune | null, exclude: string[]): string {
  const cible = focus
    ? `LACUNE À TRAITER EN PRIORITÉ : ${focus.id} — ${focus.titre} (bloque : ${focus.bloque}).`
    : `Choisis TOI-MÊME la lacune ouverte la plus utile à traiter parmi celles listées.`
  const dejaVus = exclude.length
    ? `\nAgents DÉJÀ créés (ne les répète PAS, propose un agent DIFFÉRENT) : ${exclude.join(", ")}.`
    : ""
  return `${digest}

${cible}${dejaVus}

Conçois UN SEUL agent spécialisé qui aide Mango à combler cette lacune.
Rends UNIQUEMENT un objet JSON valide (aucun texte autour), avec EXACTEMENT ces champs :
{
  "name": "nom court et parlant (ex. Gardien des régressions)",
  "role": "rôle/domaine en une phrase",
  "lacune": "la lacune ciblée (ex. ${focus?.id ?? "L35"} — ...)",
  "systemPrompt": "prompt système opérationnel et exigeant : expertise, méthode ordonnée, règles strictes, format de sortie. 150 à 350 mots.",
  "triggers": "quand déclencher cet agent (condition claire)",
  "examples": [ "exemple de requête typique" ],
  "tags": [ "mot-cle" ],
  "provider": "ollama",
  "model": "gemma4:12b"
}

N'INVENTE AUCUN OUTIL et ne demande PAS de champ "tools" : un agent forgé n'a jamais d'outils
à lui. À l'exécution il reçoit la boîte à outils RÉELLE de l'Élève (read_file, write_file,
edit_file, list_files, search_code, check_build, finish…), filtrée par la policy que Mango scelle
lui-même. Écris donc le "systemPrompt" en termes de MÉTHODE et de RÈGLES, jamais en ordonnant
d'appeler une capacité nommée qui n'existerait pas. (Décision D8 de l'audit 2026-09-28 : le champ
"tools" annonçait des outils introuvables dans tout le code — il est retiré du contrat de forge.)

Indique la compétence DOMINANTE dans le rôle et les tags (vision / raisonnement / code…).
Le cerveau (provider/model) sera AUTO-ASSIGNÉ par Mango selon cette compétence (vision → l'œil,
raisonnement/code → l'Élève GLM) — tes champs "provider"/"model" sont indicatifs, Mango tranche.

IMPORTANT — "tags" est une liste ORDONNÉE, PAS un sac de mots-clés : range-les du plus
DÉFINISSANT (ce qui identifie le mieux cet agent PARMI TOUS les autres, ex. "unity" pour un
agent Unity) au plus générique (ex. "gamedev"). Comme une liste d'ingrédients alimentaire
(le 1er = le plus présent) : le mot en position 1 pèse le plus lourd quand Mango choisit quel
agent consulter. 3 à 6 tags, en un seul mot chacun (pas de phrase), tous en minuscule sans accent.
Aucun texte hors de l'objet JSON.`
}

/** Transport injectable (tests) : rend le texte brut du modèle. */
export type ForgeAsk = (system: string, user: string) => Promise<string>

/** Appel réel : cerveau `forgeron` (Opus via l'abonnement, décision Raf 2026-06-29 —
 *  méta-prompting = l'acte le plus exigeant, et RARE → on y met le meilleur raisonneur).
 *  Plafond de tokens RELEVÉ (le défaut 1024 d'askLLM tronquait un prompt système). */
const realForgeAsk: ForgeAsk = (system, user) => {
  const brain = getBrain("forgeron")
  return askLLM(system, user, {
    provider: brain.provider,
    model: brain.model,
    timeoutMs: brain.timeoutMs ?? 120_000,
    maxTokens: 2200,
  })
}

/**
 * AUTO-ASSIGNATION DU CERVEAU (décision Raf 2026-06-29 : « un cerveau spécifique et
 * approprié à chaque agent, pas gemma tout seul »). PURE et déterministe : on classe
 * la compétence dominante de l'agent d'après ses mots (nom/rôle/lacune/tags) et on
 * renvoie le cerveau adapté.
 *  - VISION (juge un rendu, lit une image scannée…) → l'œil `qwen3.5:cloud`.
 *  - sinon (raisonnement / code / config) → l'Élève `glm-5.2:cloud` (≈ Opus, $0-ish).
 * On NE laisse PLUS le défaut `gemma4:12b` (trop faible, sous le niveau Haiku). Le
 * forgeron peut suggérer un modèle, mais Mango tranche ici — réassignable dans l'Atelier.
 */
const VISION_HINTS: RegExp[] = [
  /\bdesign\b/i, /\bpdf\b/i, /scan/i, /\bocr\b/i, /maquette/i, /screenshot/i,
  /capture/i, /sharingan/i, /\bvisuel/i, /\bvision\b/i, /\brendu\b/i,
]
export function assignBrain(spec: SpecialistAgent): { provider: LLMProvider; model: string; timeoutMs: number } {
  const hay = `${spec.name} ${spec.role} ${spec.lacune} ${(spec.tags ?? []).join(" ")}`.toLowerCase()
  const isVision = VISION_HINTS.some((re) => re.test(hay))
  return isVision
    ? { provider: "ollama", model: "qwen3.5:cloud", timeoutMs: 60_000 }
    : { provider: "openai", model: "glm-5.2:cloud", timeoutMs: 120_000 }
}

/**
 * #175 — AUTO-ASSIGNATION DU MODE (même patron que `assignBrain`, décidée à la FORGE, jamais
 * négociée par l'agent à l'exécution). PURE et déterministe : si le nom/rôle/lacune/outils
 * décrivent un agent qui AGIT (corrige, écrit, génère, répare, refactor…), il passe en mode
 * "action" avec une `toolPolicy` scellée dérivée de son domaine ; sinon il reste "conseil"
 * (avis texte, comportement historique — zéro régression sur les agents déjà forgés).
 *
 * La `toolPolicy` d'un agent action est RESTRICTIVE par construction : allowlist de base
 * (lecture + écriture bornée + build + finish) qui EXCLUT toujours run_command (shell libre),
 * add_dependency et tout accès réseau ; enrichie par domaine (PDF → lire_document/lire_archive,
 * visuel/contenu → chercher_image).
 */
// Regex ASCII — le `hay` est désaccentué (NFD) avant test, donc « génère »/« répare »/
// « crée » matchent /gener//repar//cree/ sans piège d'accent (même normalisation que tokenize).
const ACTION_HINTS: RegExp[] = [
  /corrig/, /repar/, /ecri/, /gener/, /redig/, /implement/, /refactor/, /cree/,
  /ajoute/, /modifi/, /produi/, /transform/, /nettoie/, /migr/, /fabriqu/, /assembl/,
]
// (2026-07-07, revue Fable — recommandation #6) Un agent qui JUGE (verdict, score, arbitrage,
// QA) ne doit JAMAIS recevoir write_file/edit_file, même si son prompt contient des verbes
// d'action au sens propre (« produis un verdict », « génère le score » matchent ACTION_HINTS
// par accident). Vérifié en incident réel : « Arbitre du Score Design » et « Juge d'Adéquation »
// étaient passés en mode "action" avec accès écriture avant ce correctif. Priorité ABSOLUE sur
// ACTION_HINTS (testé en premier, retour immédiat).
const JUDGE_HINTS: RegExp[] = [/\bjuge/, /verdict/, /arbitre/, /\bscore\b/, /\bqa\b/]
const PDF_HINTS: RegExp[] = [/\bpdf\b/, /scan/, /\bocr\b/, /document/, /archive/]
const CONTENT_HINTS: RegExp[] = [/image/, /photo/, /visuel/, /contenu/, /illustrat/]
// Base sûre d'un sous-agent action : JAMAIS run_command / add_dependency / réseau.
const BASE_ACTION_TOOLS: readonly string[] = [
  "read_file", "list_files", "search_code", "check_build", "write_file", "edit_file", "finish",
]

export function assignMode(spec: SpecialistAgent): { mode: "conseil" | "action"; toolPolicy?: ToolPolicy } {
  const hay = [
    spec.name, spec.role, spec.lacune, (spec.tags ?? []).join(" "),
    (spec.tools ?? []).map((t) => `${t.name} ${t.desc}`).join(" "),
  ].join(" ").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  if (JUDGE_HINTS.some((re) => re.test(hay))) return { mode: "conseil" } // un juge ne reçoit jamais write_file
  if (!ACTION_HINTS.some((re) => re.test(hay))) return { mode: "conseil" }
  const allowed = [...BASE_ACTION_TOOLS]
  if (PDF_HINTS.some((re) => re.test(hay))) allowed.push("lire_document", "lire_archive")
  if (CONTENT_HINTS.some((re) => re.test(hay))) allowed.push("chercher_image")
  return { mode: "action", toolPolicy: { allowRun: false, allowedTools: [...new Set(allowed)] } }
}

/**
 * Extrait et valide un tableau d'agents depuis la sortie brute du modèle. Tolérant :
 * retire les fences ```…```, isole le 1er `[` … dernier `]`. Ne lève jamais.
 */
export function parseForgedAgents(raw: string, opts: { now?: number } = {}): SpecialistAgent[] {
  const now = opts.now ?? Date.now()
  let txt = (raw ?? "").trim()
  // retire d'éventuelles fences markdown
  txt = txt.replace(/```(?:json)?/gi, "").trim()
  const start = txt.indexOf("[")
  const end = txt.lastIndexOf("]")
  if (start === -1 || end === -1 || end <= start) return []
  let arr: unknown
  try {
    arr = JSON.parse(txt.slice(start, end + 1))
  } catch {
    return []
  }
  if (!Array.isArray(arr)) return []
  const out: SpecialistAgent[] = []
  arr.forEach((raw, i) => {
    const spec = validateSpec(raw, { now, seq: i, defaultProvider: "openai", defaultModel: "glm-5.2:cloud" })
    if (spec) out.push(spec)
  })
  return out
}

/** Extrait et valide UN agent depuis la sortie brute (1er `{` … dernier `}`). Ne lève jamais. */
export function parseForgedAgent(raw: string, opts: { now?: number; seq?: number } = {}): SpecialistAgent | null {
  let txt = (raw ?? "").trim().replace(/```(?:json)?/gi, "").trim()
  const start = txt.indexOf("{")
  const end = txt.lastIndexOf("}")
  if (start === -1 || end === -1 || end <= start) return null
  let obj: unknown
  try {
    obj = JSON.parse(txt.slice(start, end + 1))
  } catch {
    return null
  }
  return validateSpec(obj, {
    now: opts.now ?? Date.now(),
    seq: opts.seq ?? 0,
    defaultProvider: "openai",
    defaultModel: "glm-5.2:cloud",
  })
}

export interface ForgeResult {
  created: SpecialistAgent[]
  persisted: SpecialistAgent[]
  lacunesCount: number
  failures: number
}

/** Répartit N lacunes-cibles sur la liste disponible (spread régulier pour la diversité). */
export function pickFocusLacunes(lacunes: Lacune[], n: number): (Lacune | null)[] {
  const out: (Lacune | null)[] = []
  if (lacunes.length === 0) {
    for (let i = 0; i < n; i++) out.push(null)
    return out
  }
  const step = Math.max(1, Math.floor(lacunes.length / n))
  for (let i = 0; i < n; i++) out.push(lacunes[(i * step) % lacunes.length] ?? lacunes[i % lacunes.length])
  return out
}

/**
 * LE GESTE : Mango forge N agents, UN À LA FOIS (réponses courtes = jamais tronquées).
 * Lit ses lacunes → GLM rédige chaque spec en visant une lacune distincte (noms déjà pris
 * exclus) → on valide et on persiste (dédup par nom). Ne lève jamais.
 */
export async function forgeAgents(
  n: number,
  deps: { ask?: ForgeAsk; onProgress?: (msg: string) => void } = {},
): Promise<ForgeResult> {
  const ask = deps.ask ?? realForgeAsk
  const count = Math.max(1, Math.min(20, Math.floor(n) || 10))
  const { lacunes, text } = readLacunesDigest()
  const focuses = pickFocusLacunes(lacunes, count)
  const created: SpecialistAgent[] = []
  const usedNames: string[] = []
  const existing = loadSpecialists()
  let failures = 0
  for (let i = 0; i < count; i++) {
    const focus = focuses[i] ?? null
    const prompt = buildForgeOnePrompt(text, focus, usedNames)
    let raw = ""
    try {
      raw = await ask(FORGE_SYSTEM, prompt)
    } catch (err) {
      deps.onProgress?.(`✗ agent ${i + 1}/${count} : ${(err as Error).message}`)
      failures++
      continue
    }
    const spec = parseForgedAgent(raw, { seq: i })
    // (#5) Dédup sémantique contre le registre ET contre ce qui vient d'être créé DANS ce lot.
    const dup = spec ? coversGap(spec.lacune, spec.role, [...existing, ...created]) : null
    if (spec && dup) {
      failures++
      deps.onProgress?.(`✗ agent ${i + 1}/${count} : doublon fonctionnel (déjà couvert par « ${dup.name} »)`)
    } else if (spec && !usedNames.includes(spec.name.toLowerCase())) {
      // Cerveau adapté à la compétence (vision vs raisonnement), jamais gemma seul.
      const brain = assignBrain(spec)
      spec.provider = brain.provider
      spec.model = brain.model
      spec.timeoutMs = brain.timeoutMs
      // #175 — mode + toolPolicy scellés à la forge (action si le rôle décrit un agent qui agit).
      const md = assignMode(spec)
      if (md.mode === "action") { spec.mode = "action"; if (md.toolPolicy) spec.toolPolicy = md.toolPolicy }
      created.push(spec)
      usedNames.push(spec.name.toLowerCase())
      deps.onProgress?.(`✓ agent ${i + 1}/${count} : ${spec.name} (${focus?.id ?? "libre"}) → ${brain.provider}/${brain.model}`)
    } else {
      failures++
      deps.onProgress?.(`✗ agent ${i + 1}/${count} : spec invalide ou doublon`)
    }
  }
  const persisted = created.length > 0 ? upsertSpecialists(created) : []
  return { created, persisted, lacunesCount: lacunes.length, failures }
}

/** Transport injectable (tests) du smoke-test — même forme que `ForgeAsk`. */
export type SmokeAsk = (system: string, user: string) => Promise<string>

/**
 * (2026-07-07, revue Fable — recommandation #7, axiome 6/11) Une spec fraîchement forgée
 * n'est crue sur parole : on l'invoque UNE fois sur SON PROPRE premier exemple ($0, cerveau
 * déjà assigné) et on vérifie déterministiquement une propriété de sa sortie — réponse non
 * vide, et si son propre systemPrompt annonce un format JSON, que la réponse EST un JSON
 * parsable. Pas de smoke-test possible (aucun exemple fourni) → laisse passer (ne bloque pas
 * un agent par manque de matière, ce serait un faux négatif). Ne lève jamais.
 */
export async function smokeTestSpec(
  spec: SpecialistAgent,
  deps: { ask?: SmokeAsk } = {},
): Promise<{ ok: boolean; reason?: string }> {
  const example = spec.examples?.[0]
  if (!example) return { ok: true }
  const ask: SmokeAsk = deps.ask
    ?? ((system, user) => askLLM(system, user, { provider: spec.provider, model: spec.model, timeoutMs: spec.timeoutMs }))
  let raw = ""
  try {
    raw = await ask(spec.systemPrompt, example)
  } catch (err) {
    return { ok: false, reason: `smoke-test injoignable : ${(err as Error).message}` }
  }
  const textOut = (raw ?? "").trim()
  if (!textOut) return { ok: false, reason: "smoke-test : réponse vide" }
  const wantsJson = /\bjson\b/i.test(spec.systemPrompt)
  if (wantsJson) {
    const start = textOut.indexOf("{")
    const end = textOut.lastIndexOf("}")
    if (start === -1 || end === -1 || end <= start) return { ok: false, reason: "smoke-test : format JSON annoncé, absent de la réponse" }
    try {
      JSON.parse(textOut.slice(start, end + 1))
    } catch {
      return { ok: false, reason: "smoke-test : format JSON annoncé, invalide dans la réponse" }
    }
  }
  return { ok: true }
}

/**
 * #168 — Forge UN agent CIBLÉ sur une lacune ouverte rencontrée en live (boucle d'auto-
 * évolution, semi-auto : appelée APRÈS validation de Raf). Réutilise le forgeron (Opus) +
 * `assignBrain` ; le contexte de la tâche bloquée est injecté pour un agent vraiment adapté.
 * Persiste l'agent (dédup par nom ET par fonction — #5 — puis smoke-testé — #7). NE LÈVE
 * JAMAIS → `{ agent, error? }`.
 */
export async function forgeForGap(
  gap: OpenGap,
  deps: { ask?: ForgeAsk; smokeAsk?: SmokeAsk } = {},
): Promise<{ agent: SpecialistAgent | null; error?: string }> {
  const ask = deps.ask ?? realForgeAsk
  const focus: Lacune = {
    id: gap.blocker || "L?",
    titre: gap.title || gap.blocker || "lacune",
    bloque: gap.detail || gap.task || "",
  }
  const { text } = readLacunesDigest()
  const context = gap.task
    ? `${text}\n\nCONTEXTE DE LA LACUNE RENCONTRÉE EN LIVE (tâche bloquée) : ${gap.task}`
    : text
  const existing = loadSpecialists()
  const exclude = existing.map((s) => s.name.toLowerCase())
  const prompt = buildForgeOnePrompt(context, focus, exclude)
  let raw = ""
  try {
    raw = await ask(FORGE_SYSTEM, prompt)
  } catch (err) {
    return { agent: null, error: (err as Error).message }
  }
  const spec = parseForgedAgent(raw)
  if (!spec) return { agent: null, error: "spec invalide (forge)" }
  if (exclude.includes(spec.name.toLowerCase())) return { agent: null, error: "doublon de nom" }
  // (2026-07-07, revue Fable — recommandation #5) Dédup SÉMANTIQUE, pas seulement le nom :
  // le forgeron rebaptise parfois la même lacune sous un nom différent (2 doublons stricts
  // trouvés dans le registre existant, L1 et L19). coversGap réutilise le même recouvrement
  // de tokens que la notation de lacune, appliqué ici à la spec candidate elle-même.
  const dup = coversGap(spec.lacune, spec.role, existing)
  if (dup) return { agent: null, error: `doublon fonctionnel (déjà couvert par « ${dup.name} »)` }
  const brain = assignBrain(spec)
  spec.provider = brain.provider
  spec.model = brain.model
  spec.timeoutMs = brain.timeoutMs
  // #175 — mode + toolPolicy scellés à la forge (action si le rôle décrit un agent qui agit).
  const md = assignMode(spec)
  if (md.mode === "action") { spec.mode = "action"; if (md.toolPolicy) spec.toolPolicy = md.toolPolicy }
  const smoke = await smokeTestSpec(spec, { ask: deps.smokeAsk })
  if (!smoke.ok) return { agent: null, error: smoke.reason ?? "smoke-test échoué" }
  upsertSpecialists([spec])
  return { agent: spec }
}
