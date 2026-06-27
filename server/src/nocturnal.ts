// Idée #58 (Automation nocturne) + #59 (Juge esthétique) — VAGUE 1 (cœur).
// MangoOS génère N projets (via Claude/abonnement, mode MVP autonome), les GARDE
// (≠ train-loop #32 qui les jette), et un JUGE Haiku (#59) note chacun /10 sur 5
// axes → tri/pré-filtre pour la review matinale. Vague 2 : planificateur auto +
// questionnaire structuré → axiomes (RLHF amplifié).
//
// Cerveau de génération : Claude via l'abonnement (runAgent, mode "mvp" pour
// éviter les questions de cadrage Élite — la génération est autonome, personne
// ne répond la nuit). Réutilise la diversité de train-loop (generateUniquePrompts).
import fs from "node:fs";
import path from "node:path";
import type { Express, Request, Response } from "express";
import { createProject, projectDir, WORKSPACE_DIR } from "./projects.js";
import { runAgent } from "./agent.js";
import { appendHistory, formatToolLine, loadHistory, type ChatEntry } from "./history.js";
import { inspectProject, type InspectionSignal } from "./inspection.js";
import { installBackendDepsAsync } from "./backend-generator.js";
import { generateUniquePrompts } from "./train-loop.js";
import { askLLM, resolveProvider } from "./llm-engine.js";
import { getBrain } from "./kernel.js";
import { capturePreview, getPreviewUrl } from "./vision.js";
import { loadPreferences } from "./preferences.js";
import { atomicWriteFileSync } from "./safe-io.js";
import { AXIOMS_FILE_NAME } from "./axioms.js";
import { recordCurationSample, getTunedCurationPriority } from "./kernel-curation-effect.js";

const DATA_DIR = path.join(process.cwd(), "data");
const FILE = path.join(DATA_DIR, "nocturnal.json");
const CONFIG_FILE = path.join(DATA_DIR, "nocturnal-config.json");

export interface JudgeDims {
  design: number;
  fonctionnel: number;
  originalite: number;
  coherence: number;
  qualite: number;
}

export interface NocturnalEntry {
  id: string;
  batchId: string;
  name: string; // dossier projet dans workspace/
  task: string;
  kind: string;
  projectType: string;
  ts: string;
  success: boolean;
  costUsd: number;
  score?: number; // /10 global (#59)
  dims?: JudgeDims;
  judgeComment?: string;
  reviewed?: boolean; // vague 2 : review matinale faite (questionnaire → axiomes)
}

// Réglages du planificateur auto nocturne (vague 2).
interface NocturnalConfig {
  enabled: boolean;
  count: number;
  hour: number; // heure locale (0-23) de génération
  lastAutoRun?: string; // YYYY-MM-DD du dernier run auto (1 fois/nuit)
}

function loadConfig(): NocturnalConfig {
  try {
    const c = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8")) as Partial<NocturnalConfig>;
    return {
      enabled: Boolean(c.enabled),
      count: typeof c.count === "number" ? Math.max(1, Math.min(10, c.count)) : 3,
      hour: typeof c.hour === "number" && c.hour >= 0 && c.hour <= 23 ? c.hour : 2,
      lastAutoRun: typeof c.lastAutoRun === "string" ? c.lastAutoRun : undefined,
    };
  } catch {
    return { enabled: false, count: 3, hour: 2 };
  }
}

function saveConfig(c: NocturnalConfig): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  atomicWriteFileSync(CONFIG_FILE, JSON.stringify(c, null, 2));
}

function loadEntries(): NocturnalEntry[] {
  try {
    return JSON.parse(fs.readFileSync(FILE, "utf8")) as NocturnalEntry[];
  } catch {
    return [];
  }
}

function saveEntries(entries: NocturnalEntry[]): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  atomicWriteFileSync(FILE, JSON.stringify(entries, null, 2));
}

function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// ── État du batch en cours (in-memory) ───────────────────────────────────────
let running = false;
let progress = { current: 0, total: 0, label: "" };

// ── Juge esthétique #59 ──────────────────────────────────────────────────────

/** Parse la sortie JSON du juge en {score, dims, comment} robuste (clamp 0-10).
 * Pur & testable. Renvoie null si rien d'exploitable. */
export function parseJudgeOutput(raw: string): { score: number; dims: JudgeDims; comment: string } | null {
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const obj = JSON.parse(match[0]) as Record<string, unknown>;
    const clamp = (v: unknown): number => {
      const n = typeof v === "number" ? v : Number(v);
      if (!Number.isFinite(n)) return 0;
      return Math.max(0, Math.min(10, Math.round(n * 10) / 10));
    };
    const d = (obj.dims ?? obj) as Record<string, unknown>;
    const dims: JudgeDims = {
      design: clamp(d.design),
      fonctionnel: clamp(d.fonctionnel ?? d.functional),
      originalite: clamp(d.originalite ?? d.originality),
      coherence: clamp(d.coherence ?? d.coherence_profil),
      qualite: clamp(d.qualite ?? d.quality ?? d.code),
    };
    const avg = (dims.design + dims.fonctionnel + dims.originalite + dims.coherence + dims.qualite) / 5;
    const score = obj.score !== undefined ? clamp(obj.score) : Math.round(avg * 10) / 10;
    const comment = typeof obj.comment === "string" ? obj.comment : "";
    return { score, dims, comment };
  } catch {
    return null;
  }
}

/** Collecte un échantillon de fichiers source du projet pour le juge (borné). */
function collectSource(dir: string, maxFiles = 6, maxChars = 2500): string {
  const srcDir = path.join(dir, "src");
  let out = "";
  let count = 0;
  const walk = (d: string) => {
    let items: fs.Dirent[];
    try {
      items = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const it of items) {
      if (count >= maxFiles) return;
      const p = path.join(d, it.name);
      if (it.isDirectory()) {
        if (it.name === "node_modules") continue;
        walk(p);
      } else if (/\.(jsx?|tsx?|css)$/.test(it.name)) {
        try {
          const content = fs.readFileSync(p, "utf8").slice(0, maxChars);
          out += `\n--- ${path.relative(dir, p)} ---\n${content}\n`;
          count++;
        } catch {
          /* skip */
        }
      }
    }
  };
  walk(srcDir);
  return out;
}

/** Juge un projet : note /10 sur 5 axes via Haiku (#59, abonnement). Best-effort. */
export async function judgeProject(dir: string, task: string): Promise<{ score: number; dims: JudgeDims; comment: string } | null> {
  const source = collectSource(dir);
  if (!source.trim()) return null;
  const prefs = loadPreferences(WORKSPACE_DIR);

  // Tentative de capture du rendu visuel — best-effort, jamais bloquant.
  let imageBase64: string | undefined;
  try {
    const url = getPreviewUrl();
    if (url) {
      const buf = await capturePreview(url);
      imageBase64 = buf.toString("base64");
    }
  } catch {
    // preview absent ou Playwright indispo — on juge sur le code uniquement
  }

  const hasVision = !!imageBase64;
  const system = hasVision
    ? "Tu es un juge esthétique et technique senior. Tu notes une app web générée sur 5 axes, de 0 à 10. Tu vois le RENDU VISUEL RÉEL (screenshot joint) — base le score 'design' sur ce que tu VOIS réellement, pas sur ce que le code suggère. Tu réponds UNIQUEMENT par un JSON valide, sans markdown."
    : "Tu es un juge esthétique et technique senior. Tu notes une app web générée sur 5 axes, de 0 à 10. Tu réponds UNIQUEMENT par un JSON valide, sans markdown.";
  const visualIntro = hasVision
    ? "Voici le rendu visuel de l'app (screenshot). Analyse ce que tu vois : couleurs, typographie, mise en page, cohérence visuelle — PUIS note.\n\n"
    : "";
  const user = `${visualIntro}Tâche demandée : ${task}\n${prefs ? `\nPréférences connues de l'utilisateur :\n${prefs.slice(0, 800)}\n` : ""}\nCode du projet (échantillon) :\n${source}\n\nNote ce projet de 0 à 10 sur chaque axe et donne un commentaire bref (1 phrase). Réponds EXACTEMENT par :\n{"dims":{"design":N,"fonctionnel":N,"originalite":N,"coherence":N,"qualite":N},"score":N,"comment":"…"}\n- design = esthétique/UI · fonctionnel = ça marche/complet · originalite = sort de l'ordinaire · coherence = fidèle au goût utilisateur ci-dessus · qualite = qualité du code.`;
  try {
    const raw = hasVision
      ? await askLLM(system, user, { provider: resolveProvider(process.env.NOCTURNAL_JUDGE_PROVIDER, "claude"), maxTokens: 400, imageBase64, imageMimeType: "image/jpeg" })
      : await getBrain().complete(system, user, { provider: resolveProvider(process.env.NOCTURNAL_JUDGE_PROVIDER, "claude"), maxTokens: 400 });
    return parseJudgeOutput(raw);
  } catch {
    return null;
  }
}

// ── Génération d'un projet (Claude autonome) ─────────────────────────────────

const AUTONOMOUS_SUFFIX =
  "\n\nMode autonome (génération nocturne) : ne pose AUCUNE question, prends les meilleures décisions toi-même et construis directement une app complète et soignée. Soigne particulièrement le design : déploie le moodboard (recherche de leaders réels + capture Sharingan) pour une vraie charte graphique distinctive, jamais un rendu générique par défaut.";

// Nombre de tours de réparation autonome après un build cassé (la nuit, personne
// ne corrige à la main). Borné pour ne pas brûler la nuit sur un projet rétif.
const MAX_NOCTURNAL_REPAIRS = 2;

/** Prompt de réparation : on réinjecte la sortie d'erreur (build frontend OU
 * `tsc --noEmit` du backend api/) et on demande une correction stricte (pas de
 * nouvelle feature). Pur → testable. */
export function nocturnalRepairPrompt(buildError: string): string {
  return `La compilation de l'app ÉCHOUE (build frontend vite, ou \`tsc --noEmit\` du backend api/). Corrige la ou les erreurs ci-dessous — SANS ajouter de fonctionnalité, en gardant le design en place — puis assure-toi que le projet compile proprement (frontend ET backend api/ s'il existe). Sortie de la compilation :\n\n${buildError}`;
}

// Dépendances injectables de la boucle de réparation : en prod ce sont
// inspectProject (vrai `vite build`) et un tour runAgent ; en test, des fakes
// sans réseau ni build. Même esprit que defaultRelayDeps (eleve.ts).
export interface RepairDeps {
  inspect: (dir: string) => Promise<{ ok: boolean; signal: InspectionSignal; detail: string }>;
  repairTurn: (prompt: string) => Promise<void>;
  // Install déterministe des dépendances du backend généré (api/) — appelée une
  // seule fois sur `backend-no-deps`, ce n'est PAS un tour de réparation (pas
  // de coût agent). Absente en test → la branche est inerte.
  ensureBackendDeps?: (dir: string) => Promise<void>;
  onStatus?: (msg: string) => void;
}

/** Vérifie objectivement que le projet compile (frontend ET backend api/ s'il
 * existe) et, en cas d'échec compilable, lance jusqu'à `maxRepairs` tours de
 * réparation autonome (sortie d'erreur réinjectée). Deux signaux sont
 * réparables par l'agent — `build-failed` (frontend) et `backend-failed` (api/
 * via `tsc --noEmit`) ; `backend-no-deps` est résolu une seule fois par une
 * install déterministe (pas un tour). S'arrête dès que tout passe, au plafond,
 * ou sur un signal non réparable. Renvoie l'inspection finale (`ok` = compile
 * VRAIMENT) et le nombre de tentatives. Logique pure sur ses deps → testable. */
export async function ensureBuildPasses(
  dir: string,
  deps: RepairDeps,
  maxRepairs: number = MAX_NOCTURNAL_REPAIRS,
): Promise<{ ok: boolean; signal: InspectionSignal; attempts: number }> {
  let inspection = await deps.inspect(dir);
  let attempts = 0;
  let backendInstalled = false;
  while (true) {
    const repairable = inspection.signal === "build-failed" || inspection.signal === "backend-failed";
    if (repairable && attempts < maxRepairs) {
      attempts++;
      const what = inspection.signal === "backend-failed" ? "Backend (api/)" : "Build";
      deps.onStatus?.(`🔧 ${what} en échec — réparation autonome (tentative ${attempts}/${maxRepairs})…`);
      await deps.repairTurn(nocturnalRepairPrompt(inspection.detail));
      inspection = await deps.inspect(dir);
      continue;
    }
    // Backend généré sans dépendances : on les pose UNE fois (déterministe), puis
    // on ré-inspecte — l'inspection peut alors devenir ok ou backend-failed.
    if (inspection.signal === "backend-no-deps" && deps.ensureBackendDeps && !backendInstalled) {
      backendInstalled = true;
      deps.onStatus?.("📦 Installation des dépendances backend (api/)…");
      await deps.ensureBackendDeps(dir);
      inspection = await deps.inspect(dir);
      continue;
    }
    break;
  }
  return { ok: inspection.ok, signal: inspection.signal, attempts };
}

async function buildOne(
  prompt: { task: string; kind: string; projectType: string },
  batchId: string,
  index: number,
  curationDirective = "",
): Promise<NocturnalEntry> {
  const name = `nuit-${batchId}-${index}`;
  const dir = projectDir(name);
  const provider = resolveProvider(process.env.NOCTURNAL_PROVIDER, "claude");
  let costUsd = 0;
  let success = false;
  // Génération directe via runAgent (≠ /api/chat) : on reconstitue ici l'historique
  // de chat du projet, comme le fait index.ts, pour qu'ouvrir un projet nocturne
  // montre le prompt initial + la conversation de génération dans le panneau Chat.
  const turn: ChatEntry[] = [{ role: "user", text: prompt.task, ts: new Date().toISOString() }];
  const record = (role: ChatEntry["role"], text: string) =>
    turn.push({ role, text, ts: new Date().toISOString() });
  // sessionId capturé au 1er tour → les tours de réparation REPRENNENT la même
  // conversation (l'agent garde le contexte de ce qu'il a construit).
  let sessionId: string | undefined;
  // Mode "nocturne" : arsenal design d'Élite (moodboard Sharingan + web +
  // design-system) SANS les portes humaines (personne ne valide la nuit).
  const consumeTurn = async (genPrompt: string): Promise<void> => {
    for await (const ev of runAgent(genPrompt, dir, sessionId, "sonnet", "nocturne")) {
      if (ev.type === "result") {
        costUsd += ev.costUsd ?? 0;
        sessionId = ev.sessionId;
        if (!ev.ok) record("error", `L'agent s'est arrêté : ${ev.error}`);
      } else if (ev.type === "text") record("agent", ev.text);
      else if (ev.type === "thinking") record("thinking", ev.text);
      else if (ev.type === "tool") record("tool", formatToolLine(ev.name, ev.detail));
      else if (ev.type === "error") record("error", ev.message);
    }
  };
  try {
    await createProject(name);
    // provider claude → runAgent (Claude/abonnement). (Un provider non-claude
    // resterait à câbler en vague 2 ; aujourd'hui défaut = claude.)
    void provider;
    // 1) Génération initiale. La directive de curation (#125) oriente la récolte
    //    d'artefacts vers les familles au meilleur rendement mesuré (#124). Elle
    //    n'est posée qu'au tour initial — les tours de réparation ne récoltent rien.
    await consumeTurn(prompt.task + AUTONOMOUS_SUFFIX + curationDirective);
    // 2) Vérification OBJECTIVE du build + auto-réparation. La voie Claude ne le
    //    faisait pas (≠ runRelay/Élève) : un projet pouvait être "success" sans
    //    compiler — d'où des projets cassés en galerie, notés par le juge. On
    //    rebuild réellement et, si ça casse, on fait corriger l'agent (borné).
    const verdict = await ensureBuildPasses(dir, {
      inspect: (d) => inspectProject(d),
      repairTurn: (p) => consumeTurn(p),
      ensureBackendDeps: (d) => installBackendDepsAsync(d),
      onStatus: (msg) => record("status", msg),
    });
    // success = le projet compile VRAIMENT (seul "ok" compte). Un build cassé
    // après réparations, ou un signal non réparable (timeout, no-deps…), reste KO.
    success = verdict.ok;
    if (!verdict.ok) record("error", `Build non valide après génération (${verdict.signal}).`);
  } catch {
    success = false;
  }
  // Persiste l'historique (best-effort, n'empêche jamais d'enregistrer l'entrée).
  try {
    appendHistory(dir, turn);
  } catch {
    /* best effort */
  }
  const entry: NocturnalEntry = {
    id: genId(),
    batchId,
    name,
    task: prompt.task,
    kind: prompt.kind,
    projectType: prompt.projectType,
    ts: new Date().toISOString(),
    success,
    costUsd,
  };
  // Juge (#59) — best-effort, n'empêche jamais d'enregistrer le projet.
  if (success) {
    const verdict = await judgeProject(dir, prompt.task);
    if (verdict) {
      entry.score = verdict.score;
      entry.dims = verdict.dims;
      entry.judgeComment = verdict.comment;
    }
  }
  return entry;
}

/** Génère un lot de `count` projets, les garde et les juge. Séquentiel (les
 * builds se disputeraient npm/disque en parallèle). Met à jour l'état `running`. */
export async function runNocturnalBatch(count: number, opts: { freeStyle?: boolean } = {}): Promise<void> {
  if (running) return;
  running = true;
  const batchId = genId();
  const n = Math.max(1, Math.min(count || 5, 10));
  progress = { current: 0, total: n, label: "Préparation…" };
  try {
    const prompts = generateUniquePrompts(n, opts);
    const entries = loadEntries();
    // Curation pondérée par le rendement (#125) : calculée UNE fois pour la nuit,
    // partagée par tous les projets du lot. Best-effort (jamais bloquante).
    // #126/#130 — Avance l'amortissement du réglage d'UN pas et horodate dans le
    // ledger l'état (priorité + rendement) qui DRIVE la curation de cette nuit.
    // FAIT EN PREMIER pour que la directive ci-dessous lise les poids AMORTIS de
    // cette nuit (et non ceux de la veille). Best-effort.
    recordCurationSample();
    let curationDirective = "";
    try {
      // Priorité AUTO-RÉGLÉE (#127), AMORTIE (#130) : poids exploit/explore
      // interpolés sur le lift (#129) puis lissés par EMA. La boucle se règle sur
      // sa propre preuve, sans osciller.
      curationDirective = getTunedCurationPriority().directive;
    } catch {
      /* pas de priorité → récolte non orientée (comportement historique) */
    }
    for (let i = 0; i < prompts.length; i++) {
      progress = { current: i + 1, total: n, label: prompts[i].task.slice(0, 60) };
      const entry = await buildOne(prompts[i], batchId, i + 1, curationDirective);
      entries.unshift(entry);
      saveEntries(entries); // persiste au fil de l'eau (récupérable si crash)
    }
  } finally {
    running = false;
    progress = { current: 0, total: 0, label: "" };
  }
}

// ── Review matinale → axiomes (vague 2, RLHF amplifié #41) ───────────────────

export interface NocturnalReviewInput {
  // QCM gradué (2026-06-27) : niveau par dimension. ex. { typographie:"rate", code:"bien" }.
  // Rétro-compat : les anciennes reviews passaient des booléens (oui/non).
  answers?: Record<string, string | boolean>;
  comment?: string; // commentaire libre (remplace liked/disliked ; ceux-ci restent lus en repli)
  liked?: string;
  disliked?: string;
}

// Niveaux de l'échelle QCM → libellé lisible (et tri positif/négatif).
const REVIEW_LEVEL_LABEL: Record<string, string> = {
  adore: "adoré", bien: "bien", moyen: "moyen", rate: "raté",
  true: "oui", false: "non", // rétro-compat booléen
};
function levelIsPositive(v: string | boolean | undefined): boolean {
  return v === "adore" || v === "bien" || v === true;
}

export interface ReviewSummary {
  adored: string[];
  liked: string[];
  meh: string[];
  rated: string[];
  answersText: string;
}

/** Regroupe les verdicts du QCM par niveau (PUR, testable). Gère l'ancien format booléen. */
export function summarizeReviewAnswers(answers: Record<string, string | boolean> = {}): ReviewSummary {
  const entries = Object.entries(answers);
  return {
    adored: entries.filter(([, v]) => v === "adore").map(([k]) => k),
    liked: entries.filter(([, v]) => v === "bien" || v === true).map(([k]) => k),
    meh: entries.filter(([, v]) => v === "moyen").map(([k]) => k),
    rated: entries.filter(([, v]) => v === "rate" || v === false).map(([k]) => k),
    answersText: entries.length
      ? entries.map(([k, v]) => `${k}: ${REVIEW_LEVEL_LABEL[String(v)] ?? String(v)}`).join(", ")
      : "(aucune)",
  };
}

/** Candidat dataset LoRA (#55a) : visuel (interface/couleurs/typo) ET UX (ergonomie) appréciés. PUR. */
export function reviewLoraCandidate(answers: Record<string, string | boolean> = {}): boolean {
  const visualLoved = levelIsPositive(answers.interface) || levelIsPositive(answers.couleurs)
    || levelIsPositive(answers.typographie) || levelIsPositive(answers.charte_graphique);
  return visualLoved && levelIsPositive(answers.ergonomie);
}

// Garde-fou CAPITAL (Raf, 2026-06-27) : une note de review est PROPRE AU CONTEXTE du projet.
// Aimer la palette « Paris » ne veut PAS dire « réutilise cette palette partout » (Paris ≠ Tokyo).
// On généralise la MÉTHODE, jamais les VALEURS liées au sujet. Injecté dans les 2 distillateurs
// (review nocturne ici + Revue du build dans build-review.ts).
export const REVIEW_AXIOM_GUARDRAIL =
  "RÈGLE CAPITALE — généralise la MÉTHODE, jamais les VALEURS liées au sujet. Quand l'utilisateur apprécie un choix ANCRÉ DANS LE CONTEXTE du projet (une palette/typo qui évoque Paris, des visuels d'une marque précise, l'ambiance d'un lieu), NE le fige PAS en règle universelle réutilisable ailleurs : ces valeurs appartiennent à CE sujet (Paris ≠ Tokyo). Distille plutôt le PRINCIPE transférable (ex. « dériver la palette/typo/ambiance de l'IDENTITÉ RÉELLE du sujet »). N'écris JAMAIS un axiome qui imposerait les couleurs/typo/visuels d'un sujet à un autre. Un axiome valable s'applique à N'IMPORTE QUEL futur projet, quel que soit son thème — sinon ne l'écris pas.";

/** Distille la review structurée d'un projet nocturne en axiome(s) tagué(s)
 * [review-nocturne] et l'append à .axioms.md. Best-effort, ne lève jamais. */
export async function reviewToAxioms(entry: NocturnalEntry, input: NocturnalReviewInput): Promise<void> {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const { adored, liked: liked2, meh, rated, answersText } = summarizeReviewAnswers(input.answers ?? {});
    const dimCount = Object.keys(input.answers ?? {}).length;
    // Commentaire libre : nouveau champ `comment`, repli sur l'ancien liked/disliked.
    const comment = (input.comment ?? "").trim();
    const liked = (input.liked ?? "").trim();
    const disliked = (input.disliked ?? "").trim();
    const freeText = comment || [liked && `aimé : ${liked}`, disliked && `pas aimé : ${disliked}`].filter(Boolean).join(" · ");
    // Rien d'exploitable → pas d'axiome.
    if (!freeText && dimCount === 0) return;

    const system =
      "Tu distilles la review d'un projet généré en UN À TROIS axiomes universels de goût/UX (règles abstraites réutilisables par dimension : code, typographie, couleurs, icônes, interface, animations…), pas une description. " +
      REVIEW_AXIOM_GUARDRAIL +
      " Réponds UNIQUEMENT par le(s) bloc(s) axiome demandé(s), rien d'autre.";
    const user = `L'utilisateur a passé en revue un projet web généré la nuit (« ${entry.task.slice(0, 200)} »).
Verdict par dimension (QCM) : ${answersText}.
- ADORÉ : ${adored.join(", ") || "—"}
- bien : ${liked2.join(", ") || "—"}
- moyen : ${meh.join(", ") || "—"}
- RATÉ : ${rated.join(", ") || "—"}
Commentaire libre : « ${freeText || "—"} ».

Concentre-toi sur les dimensions ADORÉES (à reproduire) et RATÉES/moyennes (à éviter). ⚠️ Mais ce qu'il a aimé ici est souvent PROPRE AU CONTEXTE de ce sujet (« ${entry.task.slice(0, 80)} ») : extrais le PRINCIPE transférable, pas les valeurs liées au sujet. Extrais 1 à 3 axiomes de goût/UX applicables à N'IMPORTE QUEL futur projet. Format EXACT pour chaque axiome (rien d'autre) :
AXIOME-UX-XX [candidat] [validé-utilisateur] [review-nocturne]
- Contexte: (quand appliquer)
- Piège: (ce qu'il n'aime pas)
- Règle d'or: (ce qu'il préfère, concret)
- Source: 🌙 review nocturne (${today})`;

    let text = "";
    try {
      text = (await getBrain().complete(system, user, { provider: resolveProvider(process.env.NOCTURNAL_JUDGE_PROVIDER, "claude"), maxTokens: 500 })).trim();
    } catch {
      return;
    }
    if (!text.startsWith("AXIOME-")) return;
    const axiomsPath = path.join(WORKSPACE_DIR, AXIOMS_FILE_NAME);
    fs.mkdirSync(WORKSPACE_DIR, { recursive: true });
    const existing = fs.existsSync(axiomsPath) ? fs.readFileSync(axiomsPath, "utf8").trim() : "";
    fs.writeFileSync(axiomsPath, (existing ? `${existing}\n\n${text}` : text) + "\n", "utf8");

    // #55a — si la charte graphique ET l'ergonomie sont validées, baliser comme
    // candidat LoRA dans .train.jsonl. On capture le code source MAINTENANT
    // (le dossier existe encore) pour que l'entrée soit autoportante — la paire
    // tâche→solution survit à toute suppression ultérieure du projet.
    // #55a — candidat LoRA si le VISUEL (interface/couleurs/typo) ET l'UX (ergonomie) sont
    // appréciés (adoré/bien). Tolère l'ancien format (charte_graphique booléen).
    const loraCrit = reviewLoraCandidate(input.answers ?? {});
    if (loraCrit) {
      const trainLog = path.join(WORKSPACE_DIR, ".train.jsonl");
      const dir = path.join(WORKSPACE_DIR, entry.name);
      const solution = collectSource(dir, 12, 4000);
      // #55a v2 — on embarque aussi la conversation complète (raisonnement +
      // outils + décisions intermédiaires), pas juste le code final.
      // C'est le CHEMIN vers la solution : pourquoi ce composant d'abord, pourquoi
      // ce refactor, pourquoi cette structure — c'est ça que le LoRA doit apprendre.
      const conversation = loadHistory(dir).filter(
        (e) => e.role === "agent" || e.role === "thinking" || e.role === "user",
      );
      fs.appendFileSync(
        trainLog,
        `${JSON.stringify({ ts: new Date().toISOString(), kind: "nocturnal-review", task: entry.task, conversation, solution, score: entry.score, dims: entry.dims, lora_candidate: true })}\n`,
        "utf8",
      );
    }
  } catch {
    return;
  }
}

// ── Planificateur auto nocturne (vague 2) ────────────────────────────────────

function localDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Tick périodique : lance un lot une fois par nuit à l'heure configurée. */
function startNocturnalScheduler(): void {
  const tick = () => {
    try {
      const cfg = loadConfig();
      if (!cfg.enabled || running) return;
      if (new Date().getHours() !== cfg.hour) return;
      if (cfg.lastAutoRun === localDate()) return; // déjà tourné cette nuit
      saveConfig({ ...cfg, lastAutoRun: localDate() });
      void runNocturnalBatch(cfg.count);
    } catch {
      /* ignore */
    }
  };
  setInterval(tick, 15 * 60 * 1000); // toutes les 15 min
}

// ── Routes ───────────────────────────────────────────────────────────────────

export function registerNocturnalRoutes(app: Express): void {
  app.get("/api/nocturnal", (_req: Request, res: Response) => {
    res.json({ entries: loadEntries(), running, progress });
  });

  app.post("/api/nocturnal/run", (req: Request, res: Response) => {
    if (running) {
      res.status(409).json({ error: "Un lot est déjà en cours" });
      return;
    }
    const body = req.body as { count?: unknown; freeStyle?: unknown };
    const count = Number(body?.count) || 3;
    const freeStyle = Boolean(body?.freeStyle);
    void runNocturnalBatch(count, { freeStyle }); // fire-and-forget : on poll via GET
    res.json({ started: true, count: Math.max(1, Math.min(count, 10)), freeStyle });
  });

  app.delete("/api/nocturnal/:id", (req: Request, res: Response) => {
    const { id } = req.params;
    const entries = loadEntries();
    const entry = entries.find((e) => e.id === id);
    if (!entry) {
      res.status(404).json({ error: "introuvable" });
      return;
    }
    // Supprime le projet du disque + l'entrée.
    try {
      fs.rmSync(projectDir(entry.name), { recursive: true, force: true });
    } catch {
      /* best effort */
    }
    saveEntries(entries.filter((e) => e.id !== id));
    res.json({ ok: true });
  });

  // Réglages du planificateur auto nocturne (vague 2).
  app.get("/api/nocturnal/config", (_req: Request, res: Response) => {
    res.json(loadConfig());
  });

  app.put("/api/nocturnal/config", (req: Request, res: Response) => {
    const body = req.body as Partial<NocturnalConfig>;
    const cur = loadConfig();
    const next: NocturnalConfig = {
      ...cur,
      ...(typeof body.enabled === "boolean" ? { enabled: body.enabled } : {}),
      ...(typeof body.count === "number" ? { count: Math.max(1, Math.min(10, body.count)) } : {}),
      ...(typeof body.hour === "number" && body.hour >= 0 && body.hour <= 23 ? { hour: body.hour } : {}),
    };
    saveConfig(next);
    res.json(next);
  });

  // Review structurée d'un projet → axiomes (vague 2). Marque l'entrée reviewée.
  app.post("/api/nocturnal/:id/review", (req: Request, res: Response) => {
    const { id } = req.params;
    const entries = loadEntries();
    const entry = entries.find((e) => e.id === id);
    if (!entry) {
      res.status(404).json({ error: "introuvable" });
      return;
    }
    const body = req.body as NocturnalReviewInput;
    void reviewToAxioms(entry, body); // fire-and-forget : la synthèse tourne en fond
    entry.reviewed = true;
    saveEntries(entries);
    res.json({ ok: true });
  });

  startNocturnalScheduler();
}
