// #182 É2 — Classificateur INTENTION→CAPACITÉS (décision D2).
//
// PROBLÈME que ça résout : É1 a donné le MODÈLE (capacité+mutation par outil) et le
// FILTRE (`policyFromCaps`), mais rien ne calcule encore QUELLES capacités une TÂCHE
// réclame. Sans ce joint, `buildEleveDiscussTools` reste figé sur `DISCUSS_DEFAULT_CAPS`
// (lecture locale + web) — la vision/l'extraction restent hors d'atteinte en Discuter
// même quand la tâche les réclame explicitement (le « trou » senti par Raf).
//
// DÉCISION D2 — trois étages, du moins cher au plus cher :
//   1. SUR-PROVISIONNEMENT des capacités read-safe : toujours `DISCUSS_DEFAULT_CAPS`
//      (read-local + read-web). Un outil non appelé ne coûte rien (function-calling
//      paresseux) → les offrir toutes est plus sûr ET moins cher qu'un classifieur
//      faillible.
//   2. SIGNAL DÉTERMINISTE pour les capacités LOURDES (vision, media-gen…) : heuristiques
//      PURES sur le texte de la tâche + le contexte. ZÉRO appel modèle.
//   3. ROUTEUR LLM en REPLI D'AMBIGUÏTÉ SEULEMENT (gate `INTENT_ROUTER_LLM`, défaut OFF) :
//      un one-shot `dispatch("routeur", …)` — jamais un nouveau cerveau dédié, on
//      réutilise le rail #150 (rate-limit, budget, ne throw jamais).
//
// `extraire_site`/`lire_page`/`chercher_web`/`requete_web` sont TOUS mappés sur la
// capacité `read-web` (É1, eleve-tool-capabilities.ts) — il n'existe pas de capacité
// distincte « web-profonde » : une URL détectée confirme simplement que `read-web`
// (déjà sur-provisionnée) est PERTINENTE ; la nouveauté réelle de ce module porte sur
// les capacités LOURDES (vision, media-gen) qui, elles, ne sont PAS offertes par défaut.

import { dispatch } from "./brain-dispatch.js";
import { flag } from "./flags.js";
import { DISCUSS_DEFAULT_CAPS, type Capability } from "./eleve-tool-capabilities.js";

/** Contexte d'une tâche (au-delà du seul texte) — porte la moitié du signal (D2, alt. rejetée #2). */
export interface TaskContext {
  /** Vrai si le tour porte une pièce jointe déposée par l'utilisateur (dossier `.assets/` non vide). */
  hasAttachment?: boolean;
}

/** Signature de `dispatch` (brain-dispatch.ts) — injectable pour les tests (jamais de mock global). */
export type DispatchFn = typeof dispatch;

const URL_RE = /https?:\/\/[^\s)>\]]+/i;
const VISION_RE =
  /(regarde|rends[- ]?toi compte|rendu|à quoi (?:ça|cela|c'|ce) (?:ressemble|rend)|capture|screenshot|aper[çc]u visuel|montre[- ]moi (?:le|la|l')|vois[- ]tu|qu'est-ce que (?:ça|cela) donne)/i;
const MEDIA_GEN_RE =
  /(g[ée]n[èe]re(?:[- ]moi)?\s+(?:une|des)\s+images?|cr[ée]e(?:[- ]moi)?\s+(?:une|des)\s+images?|dessine[- ]moi)/i;
const ATTACHMENT_RE = /\.assets\//;
/** Signal volontairement ÉTROIT — on ne veut PAS déclencher le routeur pour une simple question texte. */
const VAGUE_MULTI_CAP_RE = /(tout ce qu'il faut|comme tu (?:veux|penses)|au mieux|utilise ce qui|d[ée]brouille[- ]toi)/i;

/** Capacités « lourdes » que le signal déterministe (étage 2) peut ajouter (hors sur-provisionnement). */
const HEAVY_CAPS: readonly Capability[] = ["vision", "media-gen", "content-gen", "read-memory"];

/** Capacités connues que le routeur LLM (étage 3) est autorisé à renvoyer — jamais write/run/deps. */
const ROUTABLE_CAPS: ReadonlySet<Capability> = new Set<Capability>([
  "read-local", "read-web", "read-memory", "vision", "content-gen", "media-gen",
]);

/**
 * Étage 2 — signal DÉTERMINISTE, PUR, zéro appel modèle. Détecte les capacités LOURDES
 * réclamées par la tâche (URL, mots-clés vision/média, pièce jointe).
 */
function heavyCapsFromSignal(task: string, context: TaskContext): Set<Capability> {
  const caps = new Set<Capability>();
  if (URL_RE.test(task)) caps.add("read-web"); // confirme la pertinence de read-web (déjà sur-provisionnée)
  if (VISION_RE.test(task)) caps.add("vision");
  if (MEDIA_GEN_RE.test(task)) caps.add("media-gen");
  if (context.hasAttachment || ATTACHMENT_RE.test(task)) caps.add("read-local");
  return caps;
}

/**
 * Vrai si la tâche semble réclamer PLUSIEURS capacités mais qu'AUCUN signal déterministe
 * ne les a détectées — le SEUL cas où le routeur LLM (étage 3, gaté) est consulté.
 * Volontairement conservateur : une tâche vide, ou déjà tranchée par l'étage 2, n'est
 * jamais ambiguë.
 */
function looksAmbiguous(task: string, heavyDetected: Set<Capability>): boolean {
  if (!task.trim()) return false;
  if (heavyDetected.size > 0) return false; // le signal déterministe a déjà tranché
  return VAGUE_MULTI_CAP_RE.test(task);
}

const ROUTER_SYSTEM =
  "Tu es un routeur de capacités MangoOS. On te donne une tâche utilisateur. " +
  "Réponds UNIQUEMENT par une liste de capacités séparées par des virgules, choisies " +
  "STRICTEMENT parmi : read-local, read-web, read-memory, vision, content-gen, media-gen. " +
  "Aucune autre capacité, aucune phrase. Si aucune capacité lourde n'est nécessaire, réponds \"aucune\".";

function parseRouterCaps(summary: string): Set<Capability> {
  const out = new Set<Capability>();
  for (const raw of (summary ?? "").split(",")) {
    const name = raw.trim().toLowerCase();
    if (ROUTABLE_CAPS.has(name as Capability)) out.add(name as Capability);
  }
  return out;
}

/**
 * Étage 3 — routeur LLM en repli d'ambiguïté (gate `INTENT_ROUTER_LLM`). Réutilise
 * `dispatch("routeur", …)` (#150) : rate-limit, budget de session, breaker, NE THROW
 * JAMAIS. Un échec (dégradé/hors ligne) → ensemble vide, jamais bloquant.
 */
async function routeAmbiguous(task: string, doDispatch: DispatchFn): Promise<Set<Capability>> {
  const r = await doDispatch("routeur", ROUTER_SYSTEM, task, { freeform: true });
  if (r.status !== "ok") return new Set();
  return parseRouterCaps(r.summary);
}

/** Options d'appel de `requiredCapabilities` — `dispatch` injectable pour les tests. */
export interface RequiredCapabilitiesOpts {
  dispatch?: DispatchFn;
}

/**
 * Étages 1+2 SEULS, PURS et SYNCHRONES (zéro I/O, zéro await) : sur-provisionnement
 * read-safe + signal déterministe. C'est la sortie que produit `requiredCapabilities`
 * quand le routeur LLM (étage 3) est OFF ou non déclenché — exposée séparément pour
 * les appelants/tests qui veulent la garantie de puretÉ stricte.
 */
export function requiredCapabilitiesSync(task: string, context: TaskContext = {}): Set<Capability> {
  const caps = new Set<Capability>(DISCUSS_DEFAULT_CAPS);
  for (const c of heavyCapsFromSignal(task, context)) caps.add(c);
  return caps;
}

/**
 * `requiredCapabilities(task, context)` — LA fonction D2 : les capacités read-safe/lourdes
 * que la tâche réclame, sous le plafond de mutation de la posture (appliqué APRÈS par
 * `policyFromCaps`, pas ici — ce module ne connaît pas la posture). Trois étages décrits
 * en tête de fichier. Ne throw jamais (le routeur, seul étage à I/O, hérite de la garantie
 * `dispatch`).
 */
export async function requiredCapabilities(
  task: string,
  context: TaskContext = {},
  opts: RequiredCapabilitiesOpts = {},
): Promise<Set<Capability>> {
  const heavyDetected = heavyCapsFromSignal(task, context);
  const caps = new Set<Capability>(DISCUSS_DEFAULT_CAPS);
  for (const c of heavyDetected) caps.add(c);

  if (flag("INTENT_ROUTER_LLM") && looksAmbiguous(task, heavyDetected)) {
    const doDispatch = opts.dispatch ?? dispatch;
    const routed = await routeAmbiguous(task, doDispatch);
    for (const c of routed) caps.add(c);
  }

  return caps;
}

/** Vrai si l'ensemble de capacités contient au moins une capacité HORS sur-provisionnement
 *  par défaut (diagnostic/logs — jamais utilisé pour une décision de sécurité). */
export function hasHeavyCapability(caps: ReadonlySet<Capability>): boolean {
  return HEAVY_CAPS.some((c) => caps.has(c));
}

/**
 * Capacités que la tâche réclame et qu'un chemin TEXTE PUR (askLLM sans outils, cas des
 * cerveaux non-Élève à l'Accueil) NE PEUT PAS honorer : lecture web PROFONDE (URL détectée →
 * extraire_site), vision (Sharingan) et génération de média. Ces capacités exigent un outil ;
 * le sur-provisionnement read-safe par défaut (read-local/read-web offerts « au cas où ») n'en
 * fait PAS partie tant qu'aucun SIGNAL déterministe ne les réclame — d'où l'usage du signal
 * (étage 2), pas des défauts. Utilisé par #182 D3/É5 pour décider divulgation vs orchestration.
 * PUR, zéro appel modèle.
 */
const TOOL_DEMANDING: readonly Capability[] = ["read-web", "vision", "media-gen"];
export function toolDemandSignal(task: string, context: TaskContext = {}): Set<Capability> {
  const out = new Set<Capability>();
  for (const c of heavyCapsFromSignal(task, context)) {
    if (TOOL_DEMANDING.includes(c)) out.add(c);
  }
  return out;
}
