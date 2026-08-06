// Knowledge Flywheel (idea 10): a registry of UNIVERSAL axioms — abstract
// engineering/UX rules distilled from past work, independent of language,
// framework or project. This is the fourth knowledge store, distinct from:
//   - project memory (.memory.md)   — facts about ONE project
//   - user profile (.user-profile.md) — who the user is
//   - skills (.skills/*/SKILL.md)   — procedural HOW-TO, with code
// An axiom is the WHY/RULE, not the HOW: "a top fixed container must declare
// its stacking context", never "we set z-index:50 on the navbar of project X".
//
// Guard-rails (the user's explicit requirement, statut.md idea 10): the clapet
// is anti-FORGETTING, not anti-CORRECTION. Axioms are dated and falsifiable
// (a contradiction observed in a later turn = amend or delete), carry a
// maturity level (candidat → confirmé), are only DEFAULTS the user's request
// always overrides, and the registry is hard-capped to force curation.
import path from "node:path";
import fs from "node:fs";
import { atomicAppendFileSync, atomicWriteFileSync } from "./safe-io.js";
import { flag } from "./flags.js";
import { checkAxiomDrift, loadExistingAxiomLines } from "./axioms-drift.js";
import { safeEmbed } from "./notes-rag.js";

export const AXIOMS_FILE_NAME = ".axioms.md";
export const AXIOMS_UNIVERSAL_FILE_NAME = ".axioms-universal.md";
// N12 (audit nuit 2026-07-03) — partition DESIGN : dans le registre unique, les
// axiomes BUILD-xx dominaient le cap 3000 et noyaient les axiomes design appris.
// Les axiomes design vivent donc dans leur propre fichier, avec leur propre cap,
// injectés par une section dédiée — ils ne se disputent plus la place.
export const AXIOMS_DESIGN_FILE_NAME = ".axioms.design.md";
// (A0.3, 2026-07-03) Archive de rotation : quand un registre d'axiomes dépasse
// largement son cap d'INJECTION, ses lignes les plus ANCIENNES sont déplacées
// ici (append-only, JAMAIS injecté) au lieu d'être coupées SILENCIEUSEMENT par
// capRegistry. Rien n'est perdu : l'archive reste la matière première du
// reviewer nocturne (consolidation « sommeil »).
export const AXIOMS_ARCHIVE_FILE_NAME = ".axioms.archive.md";
// Seuil de rotation : on ne rote que si le fichier dépasse ce multiple du cap
// (marge pour ne pas roter à chaque append autour du cap).
export const AXIOMS_ROTATE_FACTOR = 3;

// Hard character cap — the registry must stay light (it rides in every turn's
// system prompt). Hitting it forces the reviewer to merge/prune, never grow.
export const AXIOMS_MAX_CHARS = 3000;
// Cap SÉPARÉ pour la partition design : plus court (des lignes-lois, pas des
// blocs Contexte/Piège/Règle), garanti présent quel que soit le poids des BUILD.
export const AXIOMS_DESIGN_MAX_CHARS = 1500;

/**
 * Borne le registre au cap d'injection en gardant les axiomes **les plus RÉCENTS**.
 *
 * ⚠️ CORRECTION DU 2026-08-06, mesurée. Cette fonction faisait `slice(0, cap)` : elle
 * gardait le DÉBUT du fichier. Or les axiomes s'AJOUTENT à la fin. Conséquence sur le
 * fichier réel de Raf — 273 859 caractères, 1 419 axiomes appris depuis le 2026-06-13 :
 * seuls **3 055 caractères étaient injectés, soit 1,1 %**, et toujours les mêmes, les
 * plus vieux. **98,9 % de ce que le système avait appris était écrit et jamais relu.**
 *
 * Garder la tête plutôt que la queue n'était pas un choix : c'est le sens par défaut de
 * `slice`. Personne ne l'a décidé, et rien ne le signalait — le message de troncature
 * disait « condense le registre », ce qui laissait croire à une perte marginale.
 *
 * On coupe désormais à une **frontière de ligne**, comme `planAxiomRotation` : injecter
 * un demi-axiome (un « Contexte : » sans sa « Règle d'or ») est pire que ne pas
 * l'injecter — le modèle lit une prémisse sans sa conclusion.
 */
export function capRegistry(text: string): string {
  if (text.length <= AXIOMS_MAX_CHARS) return text;

  const queue = text.slice(text.length - AXIOMS_MAX_CHARS);
  // Premier saut de ligne de la fenêtre : tout ce qui précède est un fragment
  // d'axiome tronqué, on le laisse à l'archive plutôt que de l'injecter à moitié.
  const frontiere = queue.indexOf("\n");
  const propre = frontiere >= 0 ? queue.slice(frontiere + 1) : queue;

  return `[... ${text.length - propre.length} caractères plus anciens non injectés — voir ${AXIOMS_ARCHIVE_FILE_NAME}]\n${propre}`;
}

// (A0.3, 2026-07-03) Calcul PUR de rotation d'un registre d'axiomes.
// Les axiomes récents sont en FIN de fichier (append). On garde les `keepChars`
// derniers caractères (coupés à une frontière de LIGNE pour ne pas casser un
// axiome) et on renvoie le reste (les plus anciens) à archiver. Ne rote que si
// le contenu dépasse `factor × cap`. Testable sans disque.
export interface RotationPlan {
  /** true si une rotation est nécessaire. */
  rotate: boolean;
  /** Lignes anciennes à ARCHIVER (append dans .axioms.archive.md). "" si pas de rotation. */
  archive: string;
  /** Nouveau contenu du registre (les axiomes récents gardés). Inchangé si pas de rotation. */
  kept: string;
}
export function planAxiomRotation(content: string, cap: number, factor: number = AXIOMS_ROTATE_FACTOR): RotationPlan {
  if (content.length <= cap * factor) return { rotate: false, archive: "", kept: content };
  // On garde AU MOINS `cap` caractères récents. Point de coupe = début de la
  // première ligne complète dans la fenêtre des `cap` derniers caractères.
  const cutTarget = content.length - cap;
  const nlIdx = content.indexOf("\n", cutTarget);
  // Si aucune \n après cutTarget (une seule ligne géante), on ne rote pas
  // (couper au milieu d'un axiome serait pire que garder).
  if (nlIdx === -1) return { rotate: false, archive: "", kept: content };
  const cut = nlIdx + 1;
  const archive = content.slice(0, cut).trimEnd();
  const kept = content.slice(cut);
  if (!archive) return { rotate: false, archive: "", kept: content };
  return { rotate: true, archive, kept };
}

export function loadAxioms(workspaceDir: string, fileName: string = AXIOMS_FILE_NAME): string {
  try {
    return capRegistry(fs.readFileSync(path.join(workspaceDir, fileName), "utf8").trim());
  } catch {
    return "";
  }
}

/** Empreinte NON plafonnée des fichiers d'axiomes — pour détecter un ajout même
 *  au-delà du cap d'injection. Un nouvel axiome est appendé en FIN de registre ;
 *  comparer le contenu plafonné (loadAxiomsFrom) masquerait tout ajout dès que
 *  l'union dépasse AXIOMS_MAX_CHARS. À n'utiliser QUE pour la détection (diff),
 *  jamais pour l'injection (qui doit rester plafonnée). */
export function axiomsFingerprint(workspaceDir: string, files: string[]): string {
  return files
    .map((f) => {
      try {
        return fs.readFileSync(path.join(workspaceDir, f), "utf8");
      } catch {
        return "";
      }
    })
    .join("");
}

/** Charge et CONCATÈNE plusieurs fichiers d'axiomes (partition par famille de
 *  modèle : universel `.axioms.md` + mécaniques `.axioms.<famille>.md`). L'ordre
 *  des fichiers est préservé ; le cap global s'applique à l'ensemble fusionné. */
export function loadAxiomsFrom(workspaceDir: string, files: string[]): string {
  const parts = files
    .map((f) => {
      try {
        return fs.readFileSync(path.join(workspaceDir, f), "utf8").trim();
      } catch {
        return "";
      }
    })
    .filter(Boolean);
  return capRegistry(parts.join("\n\n"));
}

/** Frames an axiom body as defaults, not dogma — the guard-rail is in the wording. */
function frameAxioms(body: string): string {
  if (!body) return "";
  return (
    `\n\nLearned axioms (universal engineering/UX rules distilled from past work, in ${AXIOMS_FILE_NAME}). ` +
    `Treat each as a DEFAULT to apply proactively — but the user's explicit request always wins, and if an axiom is plainly wrong for the current context, ignore it (a background reviewer reconciles the registry):\n` +
    body
  );
}

/** System-prompt section for the MAIN agent ("" if the registry is empty).
 * When .axioms-universal.md exists alongside .axioms.md, both are injected
 * with distinct labels so the agent understands the hierarchy:
 *   - universal = foundational rules for every user
 *   - personal  = this user's own learned preferences */
export function axiomsPromptSection(workspaceDir: string): string {
  const universal = loadAxioms(workspaceDir, AXIOMS_UNIVERSAL_FILE_NAME);
  const personal = loadAxioms(workspaceDir);
  if (!universal) return frameAxioms(personal); // backward-compatible
  if (!personal) return frameAxioms(universal);
  return (
    `\n\nAxioms (defaults to apply proactively — the user's explicit request always overrides):\n\n` +
    `CORE PRINCIPLES (universal — apply to all users):\n${universal}\n\n` +
    `PERSONAL RULES (learned from this user's work):\n${personal}`
  );
}

// ── Partition design (N12) ───────────────────────────────────────────────────

/**
 * Section prompt des axiomes DESIGN (`.axioms.design.md`), avec son cap dédié.
 * "" si le fichier est absent ou vide — zéro poids tant que rien n'est appris.
 * POURQUOI une section séparée : le registre général est trié/sélectionné par
 * pertinence de TÂCHE ; les axiomes design, eux, s'appliquent à TOUT rendu
 * visuel — ils doivent arriver entiers, pas en compétition avec les BUILD-xx.
 */
export function designAxiomsSection(workspaceDir: string, maxChars: number = AXIOMS_DESIGN_MAX_CHARS): string {
  let raw = "";
  try {
    raw = fs.readFileSync(path.join(workspaceDir, AXIOMS_DESIGN_FILE_NAME), "utf8").trim();
  } catch {
    return "";
  }
  if (!raw) return "";
  const capped =
    raw.length > maxChars
      ? `${raw.slice(0, maxChars)}\n[... tronqué à ${maxChars} caractères — condense le registre design]`
      : raw;
  return (
    `\n\nDesign axioms (distilled from real judged builds, in ${AXIOMS_DESIGN_FILE_NAME}) — apply to EVERY visual deliverable; the user's explicit request still wins:\n` +
    capped
  );
}

/**
 * Append UNE ligne d'axiome, routée vers le bon fichier de la partition :
 * `{design: true}` → `.axioms.design.md`, sinon → `.axioms.md` (défaut,
 * comportement historique). Les appelants actuels (nocturnal/feedback/…)
 * écrivent le fichier eux-mêmes ; ils migreront vers cette porte unique —
 * elle centralise le routage pour que la partition ne dépende pas de chaque
 * distillateur. Fail-open : ne lève jamais (un axiome perdu vaut mieux qu'un
 * tour de génération cassé).
 */
export function appendAxiom(workspaceDir: string, ligne: string, opts: { design?: boolean } = {}): void {
  const text = (ligne ?? "").trim();
  if (!text) return;
  try {
    fs.mkdirSync(workspaceDir, { recursive: true });
    const file = path.join(workspaceDir, opts.design ? AXIOMS_DESIGN_FILE_NAME : AXIOMS_FILE_NAME);
    // (A0.1, 2026-07-03) Append ATOMIQUE : fs.appendFileSync pouvait laisser une
    // ligne tronquée sur un crash mi-écriture — le cerveau appris est trop
    // précieux pour ce risque. atomicAppendFileSync gère lui-même le saut de
    // ligne séparateur (lecture du contenu courant) + écrit via temp+rename.
    atomicAppendFileSync(file, `${text}\n`);
    // (A0.3) Rotation VISIBLE si le registre déborde largement son cap : les
    // axiomes anciens vont dans l'archive au lieu d'être coupés en silence par
    // capRegistry. FIGÉ ON au lot 4 (2026-08-06) : le flag `AXIOMS_ROTATE` a disparu.
    // Sa description disait elle-même ce que l'éteindre provoquait — « archive le
    // surplus AU LIEU DE LE COUPER EN SILENCE ». Il était à `false` par défaut, donc
    // le silence était le comportement normal. Mesuré : le registre avait atteint
    // 273 859 caractères pour un cap de 3 000, soit 91 fois le cap.
    rotateAxiomsFile(workspaceDir, file, opts.design ? AXIOMS_DESIGN_MAX_CHARS : AXIOMS_MAX_CHARS);
    // (A1.3, 2026-07-03) Détecteur de dérive mémoire : gaté AXIOMS_DRIFT (défaut
    // off → comportement strictement inchangé). appendAxiom reste SYNCHRONE (son
    // contrat historique) — le check tourne en fire-and-forget (pas d'await) :
    // il ne retarde jamais l'écriture de l'axiome et ne peut jamais la faire
    // échouer (checkAxiomDrift est déjà fail-open en interne ; le .catch ici est
    // une deuxième ceinture, au cas où la promesse elle-même rejette avant
    // d'entrer dans son propre try/catch).
    if (flag("AXIOMS_DRIFT")) {
      void checkAxiomDrift(workspaceDir, text, opts.design ? AXIOMS_DESIGN_FILE_NAME : AXIOMS_FILE_NAME, {
        embed: safeEmbed,
        loadExisting: loadExistingAxiomLines,
      }).catch(() => {});
    }
  } catch {
    // fail-open assumé (cf. docstring)
  }
}

/** (A0.3) Effectue la rotation sur DISQUE : archive les anciens axiomes et
 *  réécrit le registre allégé. Atomique des deux côtés. Fail-open (best-effort :
 *  une rotation ratée n'empêche jamais l'axiome d'être déjà enregistré). Un
 *  console.warn signale la rotation (throttlé par sa rareté même : elle ne se
 *  produit qu'au franchissement du seuil). */
function rotateAxiomsFile(workspaceDir: string, file: string, cap: number): void {
  try {
    const content = fs.readFileSync(file, "utf8");
    const plan = planAxiomRotation(content, cap);
    if (!plan.rotate) return;
    const archiveFile = path.join(workspaceDir, AXIOMS_ARCHIVE_FILE_NAME);
    atomicAppendFileSync(archiveFile, `\n# — rotation ${new Date().toISOString()} depuis ${path.basename(file)} —\n${plan.archive}\n`);
    atomicWriteFileSync(file, plan.kept);
    console.warn(`[axioms] rotation : ${plan.archive.length} car. anciens archivés dans ${AXIOMS_ARCHIVE_FILE_NAME}, registre allégé (rien perdu).`);
  } catch {
    // best-effort : l'axiome est déjà appendé ; une rotation ratée n'est pas grave.
  }
}

/** Context for relevance-based retrieval (jalon D, selectAxioms v2). */
export interface AxiomSelection {
  /** Task text — its keywords drive relevance and project-type detection. */
  task?: string;
  /** Explicit project type if known (e.g. "dashboard", "jeu 2D"). */
  projectType?: string;
  /** Hard cap on how many axioms to inject (anti-saturation). Default 5. */
  max?: number;
  /** Fichiers d'axiomes à fusionner (partition modèle). Défaut : [.axioms.md]
   *  ⇒ les appelants existants gardent un comportement identique. */
  files?: string[];
}

/** Impact scope for an axiom (v4.0 ablation dimension).
 * - global  : applies to every project and every turn (default, most axioms)
 * - project : applies only within a specific project context
 * - local   : applies to a very narrow sub-task or file only
 * The parser reads a "scope:global|project|local" marker in the axiom header
 * (case-insensitive); if absent the default is "global". */
export type ImpactScope = "global" | "project" | "local";

interface AxiomBlock {
  cat: string; // VISION, UIUX, ARCH, DATA, PERF, A11Y, BUILD…
  maturity: "confirmé" | "candidat" | "?";
  scope: ImpactScope;
  text: string; // the full block, verbatim
}

/** Parses the "scope:…" marker from an axiom header line (case-insensitive).
 * Falls back to "global" when absent (the vast majority of axioms). */
function parseScope(header: string): ImpactScope {
  const m = /scope\s*:\s*(global|project|local)/i.exec(header);
  if (!m) return "global";
  const v = m[1].toLowerCase();
  return v === "project" ? "project" : v === "local" ? "local" : "global";
}

/** Splits the registry into individual axiom blocks (one per "AXIOME-…" header). */
function parseAxioms(raw: string): AxiomBlock[] {
  const blocks: AxiomBlock[] = [];
  let cur: string[] = [];
  const flush = () => {
    if (cur.length && /^\s*AXIOME-/i.test(cur[0])) {
      const header = cur[0];
      const cat = /AXIOME-([A-Z0-9]+)/i.exec(header)?.[1]?.toUpperCase() ?? "?";
      const maturity = /confirm/i.test(header) ? "confirmé" : /candidat/i.test(header) ? "candidat" : "?";
      const scope = parseScope(header);
      blocks.push({ cat, maturity, scope, text: cur.join("\n").trim() });
    }
    cur = [];
  };
  for (const line of raw.split(/\r?\n/)) {
    if (/^\s*AXIOME-/i.test(line)) flush();
    cur.push(line);
  }
  flush();
  return blocks;
}

// Canonical project types (blueprints.ts ProjectType) → the axiom categories
// that matter for that kind of project. AUTHORITATIVE in v2.1: when the caller
// passes a known type (detected from the task OR the project memory), we trust
// it directly — no longer reliant on the type word happening to appear in the
// task text (which left "webapp" silently unmatched). BUILD is universal.
const PROJECT_TYPE_CATS: Record<string, string[]> = {
  dashboard: ["DATA", "UIUX", "PERF", "A11Y"],
  jeu: ["VISION", "PERF", "ARCH"],
  slides: ["VISION", "UIUX"],
  agent: ["ARCH", "DATA"],
  vitrine: ["UIUX", "VISION", "A11Y", "PERF"],
  webapp: ["UIUX", "ARCH", "DATA", "A11Y"],
};

// Project-type keywords (found in the task) → the axiom categories that matter
// for that kind of project. BUILD is universal and scored separately.
const TYPE_CATS: Array<{ kw: RegExp; cats: string[] }> = [
  { kw: /dashboard|tableau de bord|admin|graph|chart|stat/i, cats: ["DATA", "UIUX", "PERF", "A11Y"] },
  { kw: /\bjeu\b|game|canvas|sprite|collision/i, cats: ["VISION", "PERF", "ARCH"] },
  { kw: /slide|présentation|presentation|powerpoint|deck/i, cats: ["VISION", "UIUX"] },
  { kw: /agent|\bia\b|\bllm\b|chatbot|\bapi\b/i, cats: ["ARCH", "DATA"] },
  { kw: /vitrine|landing|site|page d'accueil/i, cats: ["UIUX", "VISION", "A11Y", "PERF"] },
  { kw: /formulaire|auth|login|signup|crud|supabase|panier|e-commerce/i, cats: ["UIUX", "ARCH", "DATA", "A11Y"] },
];

const STOPWORDS = new Set([
  "avec", "pour", "dans", "une", "des", "les", "que", "qui", "sur", "par", "the", "and", "for",
  "crée", "créer", "ajoute", "ajouter", "fais", "faire", "page", "projet", "fichier",
]);

function tokens(s: string): string[] {
  return (s.toLowerCase().match(/[a-zàâäéèêëîïôöùûüç]{4,}/g) ?? []).filter((t) => !STOPWORDS.has(t));
}

function relevantCats(sel: AxiomSelection): Set<string> {
  const cats = new Set<string>();
  // v2.1 : un type de projet canonique est AUTORITAIRE — il vient de la mémoire
  // projet quand la tâche est neutre, donc on lui fait confiance même si aucun
  // mot-clé de type n'apparaît dans le texte de la tâche.
  const pt = sel.projectType?.toLowerCase();
  if (pt && PROJECT_TYPE_CATS[pt]) PROJECT_TYPE_CATS[pt].forEach((c) => cats.add(c));
  // Plus tout signal supplémentaire issu des mots-clés de la tâche.
  const hay = `${sel.task ?? ""} ${sel.projectType ?? ""}`;
  for (const { kw, cats: cs } of TYPE_CATS) if (kw.test(hay)) cs.forEach((c) => cats.add(c));
  return cats;
}

function scoreAxiom(b: AxiomBlock, sel: AxiomSelection, cats: Set<string>, kw: string[]): number {
  let s = 0;
  // Idée #41 — axiomes validés ou rejetés par l'utilisateur = priorité absolue.
  if (b.text.includes("[validé-utilisateur]") || b.text.includes("[à-éviter]")) s += 10;
  // A confirmed rule is a safer default to feed a weak model than a candidate.
  s += b.maturity === "confirmé" ? 3 : b.maturity === "candidat" ? 1 : 0;
  // Build correctness applies to every project.
  if (b.cat === "BUILD") s += 2;
  // Category matches the detected project type.
  if (cats.has(b.cat)) s += 3;
  // Keyword overlap between the task and the axiom body.
  const body = b.text.toLowerCase();
  let hits = 0;
  for (const t of kw) if (body.includes(t)) hits++;
  s += Math.min(hits, 3);
  return s;
}

/** Retrieval seam (Phase Ultime jalon A → v2 at jalon D).
 * - No selection (Claude / scenario.ts): returns the WHOLE capped registry —
 *   behavior unchanged, the Master is never saturated.
 * - With a selection (the local Élève): returns only the most RELEVANT axioms
 *   (project type + task keywords + maturity), hard-capped, so a small model
 *   isn't drowned. Ordering is by descending relevance. */
export function selectAxioms(workspaceDir: string, sel?: AxiomSelection): string {
  if (!sel) return axiomsPromptSection(workspaceDir);
  const raw = loadAxiomsFrom(workspaceDir, sel.files ?? [AXIOMS_UNIVERSAL_FILE_NAME, AXIOMS_FILE_NAME]);
  if (!raw) return "";
  const blocks = parseAxioms(raw);
  if (!blocks.length) return "";
  const cats = relevantCats(sel);
  const kw = tokens(`${sel.task ?? ""} ${sel.projectType ?? ""}`);
  const ranked = blocks
    .map((b) => ({ b, score: scoreAxiom(b, sel, cats, kw) }))
    .sort((x, y) => y.score - x.score)
    .slice(0, sel.max ?? 5)
    .map((r) => r.b.text);
  return frameAxioms(ranked.join("\n\n"));
}

export interface AxiomStats {
  byCat: Record<string, number>; // count per category (VISION, DATA…)
  byMaturity: { confirmé: number; candidat: number };
  total: number;
}

/** "Cartographie du clapet" (jalon D dashboard): density of the axiom registry
 * by category and maturity — how much the Élève's memory has accumulated. */
export function axiomStats(workspaceDir: string): AxiomStats {
  const raw = loadAxioms(workspaceDir);
  const blocks = raw ? parseAxioms(raw) : [];
  const byCat: Record<string, number> = {};
  const byMaturity = { confirmé: 0, candidat: 0 };
  for (const b of blocks) {
    byCat[b.cat] = (byCat[b.cat] ?? 0) + 1;
    if (b.maturity === "confirmé") byMaturity.confirmé++;
    else if (b.maturity === "candidat") byMaturity.candidat++;
  }
  return { byCat, byMaturity, total: blocks.length };
}

/** Returns the registry text without its LAST axiom block, plus the removed
 * block (so the caller can restore it). Used by the audit-scan A/B ablation
 * (jalon D Phase 3) to attribute a regression causally to the newest axiom. */
export function removeLastAxiom(raw: string): { without: string; removed: string | null } {
  const blocks = parseAxioms(raw);
  if (blocks.length === 0) return { without: raw, removed: null };
  return {
    without: blocks.slice(0, -1).map((b) => b.text).join("\n\n"),
    removed: blocks[blocks.length - 1].text,
  };
}

/** Generalisation of removeLastAxiom to an arbitrary index.
 * Removes the axiom block at position `index` (0-based) from the raw registry
 * text and returns the reconstructed text plus the removed block.
 * Out-of-bounds index → { without: raw, removed: null } (no-op, safe). */
export function removeAxiomAt(raw: string, index: number): { without: string; removed: string | null } {
  const blocks = parseAxioms(raw);
  if (index < 0 || index >= blocks.length) return { without: raw, removed: null };
  const removed = blocks[index].text;
  const remaining = blocks.filter((_, i) => i !== index);
  return {
    without: remaining.map((b) => b.text).join("\n\n"),
    removed,
  };
}

// ── Ablation verdict (v4.0 Clapet) ──────────────────────────────────────────

/** Epsilon threshold for ablation verdict.
 * Delta (0, PRUNE_EPSILON] → "neutral": the axiom helps a tiny bit but not
 * enough to be conclusive. Above → "keep". At or below 0 → "prune". */
const PRUNE_EPSILON = 0.02; // 2 percentage-point band

/** Pure function: computes the ablation verdict from two effectPct values
 * (0–100, result of aggregate().effectPct).
 *
 * NOTE — "prune" is a RECOMMENDATION only, never an automatic deletion.
 * The clapet is anti-FORGETTING, not anti-CORRECTION. A human must review
 * every "prune" candidate before acting. */
export function computeAblationVerdict(
  yieldWith: number,
  yieldWithout: number,
): { delta: number; verdict: "keep" | "prune" | "neutral" } {
  const delta = yieldWith - yieldWithout;
  const verdict: "keep" | "prune" | "neutral" =
    delta > PRUNE_EPSILON ? "keep" : delta <= 0 ? "prune" : "neutral";
  return { delta, verdict };
}

/** Technical / "code" categories — axioms in these categories are the ones
 * whose ablation is meaningful to measure (they affect compilation, patterns,
 * architecture decisions).  UX/visual/accessibility categories are excluded
 * from the code-axiom count because the held-out suite is code-only. */
const CODE_CATS = new Set(["BUILD", "ARCH", "DATA", "PERF"]);

/** Returns the number of axioms whose category is considered a "code" axiom
 * (BUILD | ARCH | DATA | PERF).  Used for gating: prune-scan is only worth
 * running once enough code axioms exist to produce a meaningful signal. */
export function countCodeAxioms(raw: string): number {
  return parseAxioms(raw).filter((b) => CODE_CATS.has(b.cat)).length;
}

/** Minimum number of code axioms required before --prune-scan emits prune
 * recommendations.  Below this threshold the registry is too sparse and
 * ablation noise dominates the signal. */
export const PRUNE_MIN_AXIOMS = 5;

/** Cheap change detector (size + mtime). */
export function axiomsSnapshot(workspaceDir: string): string {
  try {
    const st = fs.statSync(path.join(workspaceDir, AXIOMS_FILE_NAME));
    return `${st.size}:${st.mtimeMs}`;
  } catch {
    return "";
  }
}
