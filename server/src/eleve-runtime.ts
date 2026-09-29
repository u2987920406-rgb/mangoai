// Runtime agentique de l'Élève (#146 Phase 2) — le MOTEUR DE BUILD maison.
//
// askEleveAgentic (eleve.ts) prouvait la boucle function-calling pour EXPLORER
// (lecture seule, conclure en texte). Ici on la généralise en un vrai moteur :
// l'Élève écrit → vérifie (check_build) → lit son erreur → corrige → recommence,
// jusqu'à `finish` ou une borne — c'est « la coquille de Claude pilotée par GLM ».
//
// Module PUR : il ne connaît ni l'env, ni la config, ni le réseau. Le transport
// (`post`) est INJECTÉ — eleve.ts fournit le vrai (OpenAI-compat), les tests un
// faux scripté. D'où une boucle 100 % testable sans réseau ni vrai build.

import { z } from "zod";
import { ToolRegistry, toOpenAITools, type OpenAITool, type KernelTool } from "./kernel/kernel-mcp.js";
import { FINISH_TOOL } from "./eleve-tools/eleve-action-tools.js";
import type { KernelTracer } from "./kernel/kernel-trace.js";
import { runHooks, type HookRegistration } from "./mango-hooks.js";
import { flag } from "./flags.js";
import { emptyWorkingState, updateWorkingState, formatWorkingState, type WorkingState } from "./working-memory.js";
import { saveSnapshot, clearSnapshot, loadSnapshot } from "./loop-state.js";
import { runAsActor, currentActor, type Actor } from "./perimeter-context.js";
import { appendBacklog } from "./project-backlog.js";
import { coerceTextToolCall } from "./tool-call-coerce.js";

// ── Types du dialogue OpenAI-compat ──────────────────────────────────────────

export interface ToolCall {
  id: string;
  function: { name: string; arguments: string };
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

/** Le transport injecté : un tour de modèle. `tools=null` → appel SANS outils
 * (pour forcer une conclusion). Renvoie le contenu + d'éventuels tool_calls. */
export type PostFn = (
  messages: ChatMessage[],
  tools: OpenAITool[] | null,
) => Promise<{ content: string; toolCalls?: ToolCall[] }>;

// ── Bornes (garde-fous : contexte ET coût cloud) ─────────────────────────────

const DEFAULT_MAX_ITER = Number(process.env.ELEVE_AGENTIC_MAX_ITER ?? 24);
const DEFAULT_CTX_MAX = Number(process.env.ELEVE_AGENTIC_CTX_MAX ?? 60_000);
const DEFAULT_MAX_TOOL_RESULT = 12_000; // taille max d'un résultat d'outil réinjecté
const DEFAULT_REPEAT_LIMIT = 3; // un MÊME appel identique au-delà → on injecte un correctif
// Seuil de blocage : nb de correctifs CUMULÉS tolérés avant la sortie « bloqué ».
// DÉCOUPLÉ de repeatLimit (révision 2026-06-24, « apprendre pas secourir ») : on
// donne à l'Élève (GLM, classe Fable 5) la MARGE de se corriger lui-même plusieurs
// fois plutôt que de l'étouffer dès 3 correctifs et de courir vers Claude.
const DEFAULT_MAX_CORRECTIONS = Number(process.env.ELEVE_AGENTIC_MAX_CORRECTIONS ?? 8);
const KEEP_RECENT = 6; // messages récents jamais compactés
// Outils de LECTURE : relire le même fichier ne fait pas avancer → on coupe court
// dès la 1re relecture identique (anti-sur-exploration, #149 fix GLM bloqué).
const READ_ONLY_TOOLS = ["read_file", "list_files", "search_code"];
// Outils d'ÉCRITURE/ACTION : leur appel réussi prouve que le modèle AGIT → remet à
// zéro le compteur d'exploration (anti-exploration-stérile ci-dessous).
const WRITE_TOOLS = ["write_file", "edit_file"];
// Anti-exploration-stérile (#146 révision 2026-06-24) : enchaîner les lectures —
// même DISTINCTES et réussies — sans jamais écrire ne termine pas la tâche. C'est le
// VRAI motif de blocage de GLM sur grosses apps (12 search_code, 0 écriture, plafond).
// Au seuil, on refuse une lecture de plus et on POUSSE à agir. On lui apprend le rythme.
const DEFAULT_EXPLORE_BEFORE_ACT = Number(process.env.ELEVE_EXPLORE_BEFORE_ACT_MAX ?? 6);

export interface AgenticOptions {
  /** Transport (obligatoire). Réel en prod (eleve.elevePost), faux en test. */
  post: PostFn;
  model?: string;
  maxIterations?: number;
  ctxMaxChars?: number;
  maxToolResult?: number;
  repeatLimit?: number;
  maxCorrections?: number; // seuil de correctifs cumulés avant sortie « bloqué »
  exploreBeforeAct?: number; // lectures consécutives tolérées sans écrire (défaut 6)
  readOnlyTools?: string[]; // override des outils de lecture (défaut READ_ONLY_TOOLS)
  /** Tracer optionnel (best-effort). Absent → aucun span (tests purs). */
  tracer?: KernelTracer;
  onTool?: (name: string, args: string) => void;
  onLog?: (line: string) => void;
  /** (#160/L17) Rappel COMPACT du plan de l'Élève (ou "" s'il n'en a pas posé).
   * Closure → le runtime reste découplé d'eleve-plan. Réinjecté DANS les nudges des
   * gardes anti-sur-exploration : quand l'Élève dérive en re-lisant, on lui remet
   * son plan sous les yeux EN COURS de boucle (pas seulement à l'auto-relance). */
  planReminder?: () => string;
  /** Interruption coopérative (clic « Stop »). Lue en TÊTE de chaque itération :
   * `true` → la boucle sort proprement avec `aborted:true` (rien n'est tué en
   * plein milieu d'une écriture). Closure → le runtime reste découplé d'interrupt.ts. */
  shouldAbort?: () => boolean;
  /** (#172) Hooks résolus, exécutés autour de chaque appel d'outil (PreToolUse/PostToolUse).
   * Injectés par l'appelant (eleve.ts lit <projectDir>/.hooks/hooks.json). N'agissent que si
   * ELEVE_HOOKS=on ET la liste est non vide → sinon comportement identique (zéro régression). */
  hooks?: HookRegistration[];
  /** (#172) Répertoire projet, passé aux hooks comme contexte d'exécution. */
  projectDir?: string;
  /** (B0.1, 2026-07-03) Budget EXPLICITE de la boucle, au-delà du plafond
   * d'itérations. Optionnel → absent = comportement identique à aujourd'hui.
   * Au dépassement, on sort par la même porte douce que le plafond d'itérations
   * (un dernier tour sans outils pour conclure) et on marque `budgetExhausted`.
   * `maxPromptChars` = plafond du poids contexte (proxy tokens) mesuré avant
   * chaque appel modèle ; `maxToolCalls` = plafond cumulé d'appels d'outils. */
  budget?: { maxPromptChars?: number; maxToolCalls?: number };
  /** (Revue Fable 2026-07-03, 🟠2) `false` = pas de snapshot de reprise pour CE
   * run, même sous ELEVE_RESUME. Les sous-agents délégués partagent le même
   * `projectDir` que le parent : sans ce verrou, chacun ÉCRASAIT le snapshot du
   * parent (et son `finish` le supprimait) → crash pendant une délégation =
   * aucune reprise possible. Le parent (profondeur 0) reste seul à snapshotter. */
  snapshots?: boolean;
  /** (#180 E2) Acteur qui pilote ce run — decide le palier de PERIMETRE quand
   * DESKTOP_PERIMETER est ON (D4). `interactive` = chat/Raf present (defaut,
   * comportement historique) ; `autonomous` = nuit/cron/Stratege/tuteur. Absent
   * = on herite du contexte d'acteur ambiant (`currentActor()`, pose par un
   * runner nocturne) puis, a defaut, `interactive`. Gate OFF = sans effet. */
  actor?: Actor;
  /** (#183) Étiquette lisible de l'acteur qui pilote CE run, pour la boîte noire
   * projet (.backlog.jsonl) — ex. « Élève (glm-5.2:cloud) », « Agent forgé :
   * Contremaître local ». Absent → "Élève" (comportement historique, chat). */
  actorLabel?: string;
}

export interface AgenticBuildResult {
  /** Résumé final (si `finish`) ou dernier contenu du modèle. */
  text: string;
  /** Outils appelés (diagnostic / trace). */
  toolTrace: Array<{ name: string; args: string }>;
  /** `true` si le modèle a appelé `finish` (fin propre et explicite). */
  finished: boolean;
  /** Nombre d'itérations consommées. */
  iterations: number;
  /** `true` si la boucle a été coupée pour cause de blocage (répétition). */
  stuck: boolean;
  /** `true` si l'utilisateur a demandé l'arrêt (Stop) — sortie volontaire, PAS un
   * échec : l'appelant ne doit ni escalader vers Claude ni traiter ça comme un bug. */
  aborted?: boolean;
  /** (B0.1) `true` si la boucle a été conclue pour cause de BUDGET dépassé
   * (poids contexte ou nombre d'appels d'outils), et non de plafond d'itérations
   * ou de blocage. Diagnostic / garde-fou de coût — champ optionnel, rétrocompat. */
  budgetExhausted?: boolean;
}

// (Revue globale 2026-07-03, 🔴 « Budget & compaction ignorent tool_calls.arguments »)
// Réduction PARTAGÉE des arguments d'un appel d'outil : write_file/edit_file → le
// `path` SEUL (le contenu entier du fichier n'a aucune valeur une fois écrit — le
// modèle peut relire le fichier s'il en a besoin), les autres tronqués à
// SNAPSHOT_ARGS_MAX. C'était déjà la logique du snapshot de reprise (persistance) ;
// elle sert maintenant AUSSI la compaction de la boucle VIVANTE (ci-dessous), qui
// jusqu'ici ne touchait jamais aux `tool_calls` et laissait le fichier ENTIER d'un
// vieux write_file resservi au modèle à CHAQUE tour suivant.
const SNAPSHOT_ARGS_MAX = 300;
// 🔴 (2026-09-29) UNE TRONCATURE BRUTE DE JSON EST UN JSON INVALIDE, et l'API
// Ollama Cloud REJETTE tout l'historique pour ça : « invalid tool call arguments »
// → HTTP 400 → le tour de l'Élève meurt. Reproduit en sonde le 2026-09-29 : un
// tool_call aux arguments tronqués (fin de chaîne coupée) donne 400, un JSON
// valide passe. La réduction ci-dessous DOIT donc toujours rendre du JSON
// PARSEABLE — c'est la seule contrainte qui compte pour l'API.
//
// Règle : write_file/edit_file → `path` seul (le contenu n'a aucune valeur une
// fois écrit ; le modèle peut relire). Les autres outils → on RÉDUIT les VALEURS
// LONGUES du JSON (les chaînes sont coupées PROPREMENT à l'intérieur de l'objet),
// jamais la sérialisation elle-même.
function reduceToolArgs(name: string, args: string): string {
  if (name === "write_file" || name === "edit_file") {
    try {
      const a = JSON.parse(args) as { path?: unknown };
      if (typeof a.path === "string") return JSON.stringify({ path: a.path });
    } catch {
      /* args illisibles : réduits comme les autres, ci-dessous */
    }
  }
  if (args.length <= SNAPSHOT_ARGS_MAX) return args;
  let parsed: unknown;
  try {
    parsed = JSON.parse(args);
  } catch {
    // Illisible : on ne peut PAS couper la chaîne (ce serait un JSON invalide).
    // On rend un objet vide — valide, honnête (l'appel n'est plus rejouable, mais
    // il ne cassera jamais le tour), et le marqueur dit pourquoi.
    return JSON.stringify({ _reduce: "arguments illisibles, tronqués" });
  }
  const budget = SNAPSHOT_ARGS_MAX;
  const shrink = (v: unknown): unknown => {
    if (typeof v === "string") {
      return v.length > 120 ? `${v.slice(0, 120)}… [${v.length} car. au total]` : v;
    }
    if (Array.isArray(v)) return v.slice(0, 12).map(shrink);
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) out[k] = shrink(val);
      return out;
    }
    return v;
  };
  let reduced = JSON.stringify(shrink(parsed));
  // Si les valeurs étaient courtes mais nombreuses, la sérialisation reste longue :
  // dernier recours, un objet qui décrit l'appel au lieu de le rejouer. TOUJOURS valide.
  if (reduced.length > budget) {
    reduced = JSON.stringify({ _reduce: `arguments ${args.length} car. — contenu retiré` });
  }
  return reduced;
}

/** Somme des longueurs de contenu (proxy du poids contexte). Inclut désormais les
 * arguments des `tool_calls` d'un message assistant (🔴 revue 2026-07-03) : un
 * `write_file` y range le fichier ENTIER, renvoyé au modèle à CHAQUE tour suivant
 * tant qu'il n'a pas été compacté (cf. `compact` ci-dessous) — un `totalChars` qui
 * ne comptait que `content` sous-estimait donc largement le vrai poids du prompt,
 * et le fusible `maxPromptChars` (budget) ne se déclenchait jamais à temps. */
function totalChars(messages: ChatMessage[]): number {
  return messages.reduce((n, m) => {
    const toolCallsLen = m.tool_calls?.reduce((s, tc) => s + (tc.function.arguments?.length ?? 0), 0) ?? 0;
    return n + (m.content?.length ?? 0) + toolCallsLen;
  }, 0);
}

// (Revue Fable 2026-07-03, 🟠4) Trace COMPRESSÉE pour le snapshot : sans elle,
// `toolTrace` embarque les args COMPLETS de chaque write_file (le contenu entier
// des fichiers) et le snapshot re-sérialisé à CHAQUE itération devient du O(n²)
// d'I/O synchrone sur un run long. Les écritures gardent un args PARSEABLE réduit
// au `path` seul (changedFilesFromTrace — eleve-gate.ts — continue de fonctionner
// sur une trace restaurée) ; le reste est tronqué.
function snapshotTrace(trace: Array<{ name: string; args: string }>): Array<{ name: string; args: string }> {
  return trace.map((t) => {
    const reduced = reduceToolArgs(t.name, t.args);
    return reduced === t.args ? t : { name: t.name, args: reduced };
  });
}

/** (🟠4 suite — trouvé par test-fondations-gates-combines) Messages compressés
 * pour le snapshot : les `tool_calls` des messages assistant portent les args
 * COMPLETS (contenus entiers des write_file), que la compaction ne comptait PAS
 * avant (elle ne mesurait que `content`). Sans cette compression, le snapshot
 * re-sérialisé à chaque itération embarque tous les contenus écrits (123 Ko mesurés
 * pour 12 écritures de 10 k). Même règle que snapshotTrace ; copies, jamais de
 * mutation des messages vivants (la boucle vivante, elle, mute en place — cf. `compact`). */
function snapshotMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((m) => {
    if (m.role !== "assistant" || !m.tool_calls?.length) return m;
    return {
      ...m,
      tool_calls: m.tool_calls.map((tc) => {
        const args = tc.function.arguments ?? "";
        const reduced = reduceToolArgs(tc.function.name, args);
        return reduced === args ? tc : { ...tc, function: { name: tc.function.name, arguments: reduced } };
      }),
    };
  });
}

/** Fichiers écrits, extraits d'une trace — miroir volontairement local de
 * `changedFilesFromTrace` (eleve-gate.ts) pour ne pas créer de cycle d'import. */
function filesFromTrace(trace: Array<{ name: string; args: string }>): string[] {
  const out = new Set<string>();
  for (const t of trace) {
    if (t.name !== "write_file" && t.name !== "edit_file") continue;
    try {
      const a = JSON.parse(t.args) as { path?: unknown };
      if (typeof a.path === "string" && a.path.trim()) out.add(a.path.trim());
    } catch {
      /* illisible : on saute */
    }
  }
  return [...out];
}

/** Compaction : au-delà de `ctxMax`, tronque les VIEUX résultats d'outils
 * volumineux (read_file/search_code…), en gardant intacts system, user et les
 * derniers échanges. Sans elle, une longue boucle fait exploser contexte + coût.
 *
 * (🔴 revue 2026-07-03) Compacte AUSSI les `tool_calls.arguments` des vieux messages
 * assistant : un `write_file` y range le fichier ENTIER, et sans cette réduction ce
 * message est resservi au modèle IDENTIQUE à chaque tour suivant, même une fois
 * « compacté » (avant ce correctif, seul `content` — jamais renseigné pour un tour
 * assistant qui appelle un outil — était concerné). Même réduction que le snapshot
 * de reprise (`reduceToolArgs`) : write_file/edit_file → `path` seul, le reste tronqué. */
function compact(messages: ChatMessage[], ctxMax: number): boolean {
  if (totalChars(messages) <= ctxMax) return false;
  let compacted = false;
  for (let i = 2; i < messages.length - KEEP_RECENT; i++) {
    const m = messages[i];
    if (m.role === "tool" && m.content.length > 200) {
      // (N10) longueur d'origine dans le marqueur : le modèle sait qu'il doit RELIRE
      // s'il veut ce contenu, au lieu de croire que ces 200 car. étaient tout.
      m.content = m.content.slice(0, 200) + ` … [résultat compacté — original ${m.content.length} car., relis si besoin]`;
      compacted = true;
    }
    if (m.role === "assistant" && m.tool_calls?.length) {
      for (const tc of m.tool_calls) {
        const before = tc.function.arguments ?? "";
        const reduced = reduceToolArgs(tc.function.name, before);
        if (reduced !== before) {
          tc.function.arguments = reduced;
          compacted = true;
        }
      }
    }
  }
  return compacted;
}

/**
 * (#172) Invoque un outil en passant par les hooks PreToolUse/PostToolUse quand ils sont
 * actifs. Gate : `enabled` (= ELEVE_HOOKS=on, décidé par l'appelant) ET au moins un hook.
 * Sinon → invocation DIRECTE, strictement identique à avant (zéro régression) :
 *  - PreToolUse deny/ask → l'outil n'est PAS exécuté, un message de refus est renvoyé (isError) ;
 *  - PreToolUse updatedInput → l'outil est invoqué avec les arguments réécrits ;
 *  - PostToolUse → observation (le résultat est déjà produit ; la V1 ne le modifie pas).
 * runHooks ne lève jamais ; l'invoke lui-même reste protégé par le try/catch de l'appelant.
 */
/** (#183) Résumé COURT et lisible des arguments d'un outil, pour la boîte noire —
 * jamais le contenu complet (un write_file de 400 lignes ne doit pas dupliquer
 * son contenu dans le journal). Privilégie un champ "path"/"file" explicite. */
function summarizeToolArgs(args: Record<string, unknown>): string {
  const path = args.path ?? args.file ?? args.filePath ?? args.command;
  if (typeof path === "string" && path) return path;
  try {
    return JSON.stringify(args).slice(0, 120);
  } catch {
    return "";
  }
}

export async function runGatedInvoke(
  registry: ToolRegistry,
  name: string,
  args: Record<string, unknown>,
  opts: { hooks?: HookRegistration[]; projectDir?: string; enabled?: boolean; actorLabel?: string } = {},
): Promise<{ text: string; isError: boolean }> {
  const hooks = opts.hooks ?? [];
  const actor = opts.actorLabel ?? "Élève";
  const logBacklog = (r: { text: string; isError: boolean }) => {
    if (opts.projectDir) {
      appendBacklog(opts.projectDir, { actor, action: name, detail: summarizeToolArgs(args), ok: !r.isError });
    }
    return r;
  };
  if (!opts.enabled || hooks.length === 0) {
    const r = await registry.invoke(name, args);
    return logBacklog({ text: r.text, isError: !!r.isError });
  }
  const projectDir = opts.projectDir ?? "";
  const pre = await runHooks({ event: "PreToolUse", projectDir, toolName: name, toolInput: args }, hooks);
  if (pre.decision !== "allow") {
    const why = pre.reasons.join(" ; ")
      || (pre.decision === "ask" ? "confirmation requise (aucun humain dans la boucle)" : "refusé");
    return logBacklog({ text: `⛔ Action « ${name} » bloquée par un hook : ${why}`, isError: true });
  }
  const finalArgs = pre.updatedInput ?? args;
  const r = await registry.invoke(name, finalArgs);
  const result = { text: r.text, isError: !!r.isError };
  // PostToolUse : observation seule en V1 (le résultat est déjà produit).
  await runHooks({ event: "PostToolUse", projectDir, toolName: name, toolInput: finalArgs, result: result.text }, hooks);
  return logBacklog(result);
}

/**
 * Le moteur. Tourne la boucle outils jusqu'à `finish`, blocage, ou plafond.
 * À blocage/plafond → `finished:false` (l'appelant escaladera vers le Maître).
 */
export async function buildAgentic(
  system: string,
  user: string,
  registry: ToolRegistry,
  opts: AgenticOptions,
): Promise<AgenticBuildResult> {
  // (#180 É2) Établit l'ACTEUR pour toute la durée du run : `opts.actor` explicite,
  // sinon le contexte ambiant hérité d'un runner nocturne, sinon `interactive`.
  // AsyncLocalStorage propage l'acteur à TOUS les handlers d'outils appelés dans
  // la boucle (sous-agents délégués compris — ce wrapper re-établit le même acteur,
  // idempotent). Gate DESKTOP_PERIMETER OFF → aucun effet observable.
  const actor: Actor = opts.actor ?? currentActor();
  return runAsActor(actor, () => buildAgenticImpl(system, user, registry, opts));
}

async function buildAgenticImpl(
  system: string,
  user: string,
  registry: ToolRegistry,
  opts: AgenticOptions,
): Promise<AgenticBuildResult> {
  const maxIter = opts.maxIterations ?? DEFAULT_MAX_ITER;
  const ctxMax = opts.ctxMaxChars ?? DEFAULT_CTX_MAX;
  const maxToolResult = opts.maxToolResult ?? DEFAULT_MAX_TOOL_RESULT;
  const repeatLimit = opts.repeatLimit ?? DEFAULT_REPEAT_LIMIT;
  const maxCorrections = opts.maxCorrections ?? DEFAULT_MAX_CORRECTIONS;
  const exploreMax = opts.exploreBeforeAct ?? DEFAULT_EXPLORE_BEFORE_ACT;
  const readOnly = new Set(opts.readOnlyTools ?? READ_ONLY_TOOLS);
  // Une écriture, une édition OU une délégation prouvent que le modèle agit.
  const writeTools = new Set([...WRITE_TOOLS, DELEGATE_TOOL]);
  const tools = toOpenAITools(registry);

  const messages: ChatMessage[] = [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
  const toolTrace: AgenticBuildResult["toolTrace"] = [];
  const seen = new Map<string, number>(); // (name+args) → nb d'appels identiques
  const readKeys = new Set<string>(); // outils de lecture déjà appelés (anti-relecture #3)
  let corrections = 0; // nb de relances correctives injectées
  let errorStreak = 0; // échecs d'outils CONSÉCUTIFS (anti-tâtonnement)
  let readsSinceWrite = 0; // lectures réussies depuis la dernière écriture (anti-exploration-stérile)
  let hasWritten = false; // (L17) au moins une écriture/édition/délégation réussie ce run

  // (B0.2, gate ELEVE_ETAT) État de travail DÉDUIT de la boucle, réinjecté quand
  // la compaction tronque le contexte. Gate off → jamais calculé/inséré (identique
  // à avant). `stateMsgIndex` mémorise où vit le message d'état pour le REMPLACER
  // (jamais l'empiler) une fois qu'il existe.
  const eleveEtatOn = flag("ELEVE_ETAT");
  let workingState: WorkingState = emptyWorkingState();
  let stateMsgIndex: number | null = null;

  // (B1.2, gate ELEVE_REFLEXION) Phase de RÉFLEXION explicite : un tour SANS outils
  // où le modèle fait le point (acquis / blocage / prochaine étape). Déclenchée
  // périodiquement OU après un blocage (errorStreak), bornée par run, jamais deux
  // d'affilée. Le point survit comme message assistant → informe les tours suivants.
  // Gate off → aucun appel supplémentaire (comportement identique).
  const eleveReflexionOn = flag("ELEVE_REFLEXION");
  const REFLEXION_EVERY = Math.max(3, Number(process.env.ELEVE_REFLEXION_EVERY ?? 8));
  const REFLEXION_MAX = Math.max(1, Number(process.env.ELEVE_REFLEXION_MAX ?? 3));
  let reflexionsCount = 0;
  let lastReflexionIter = -2;

  // (B0.3, gate ELEVE_RESUME) Snapshot de reprise. Gate off OU projectDir absent
  // OU `snapshots:false` (sous-agent délégué, 🟠2) → jamais écrit ni restauré.
  const eleveResumeOn = flag("ELEVE_RESUME") && opts.snapshots !== false;
  const clearRunSnapshot = (): void => {
    if (eleveResumeOn && opts.projectDir) clearSnapshot(opts.projectDir);
  };

  // (L17) Enrichit le nudge d'une garde anti-sur-exploration : on PRÉFIXE le rappel
  // du plan (l'ancre — l'Élève qui dérive se voit remettre ses étapes EN COURS de
  // boucle), et si des fichiers ont DÉJÀ été écrits, on pousse explicitement à clore
  // (le motif observé : l'app est complète mais l'Élève re-lit au lieu d'appeler finish).
  const guardNudge = (base: string): string => {
    const plan = opts.planReminder?.() ?? "";
    const finishCue = hasWritten
      ? "\n\n✅ Tu as DÉJÀ écrit des fichiers ce tour. Si toutes les étapes de ton plan sont faites et que le build " +
        "passe, appelle finish MAINTENANT — ne re-lis pas, ne re-planifie pas."
      : "";
    return (plan ? plan + "\n\n" : "") + base + finishCue;
  };

  // (B1.4, gate ELEVE_RESUME) REPRISE inter-session : si un snapshot FRAIS de la
  // MÊME tâche existe (le serveur a crashé/redémarré au milieu d'un run), on
  // restaure l'historique + la trace + les compteurs et on reprend là où on en
  // était, avec un nudge de RE-VÉRIFICATION (l'espace de travail a pu changer).
  // Garde « même tâche » : le champ DÉDIÉ `snap.user` doit correspondre au `user`
  // courant — sinon c'est une AUTRE tâche, on ignore (run neuf, le snapshot sera
  // écrasé). (Revue Fable 🔴1 : l'ancienne garde comparait `messages[1]`, or
  // ELEVE_ETAT splice l'état de travail en index 1 après compaction → la garde
  // était toujours fausse sur un run long avec les deux gates allumés, et la
  // reprise ne fonctionnait JAMAIS dans sa config nominale.)
  let startIter = 0;
  if (eleveResumeOn && opts.projectDir) {
    const snap = loadSnapshot(opts.projectDir);
    if (snap && snap.user === user && snap.messages.length >= 2) {
      messages.length = 0;
      messages.push(...snap.messages);
      for (const t of snap.toolTrace) toolTrace.push(t);
      hasWritten = snap.hasWritten;
      startIter = Math.max(0, Math.min(snap.iter, maxIter));
      // (🔴1 suite) Le snapshot peut déjà contenir un message d'ÉTAT DE TRAVAIL en
      // index 1 : le prochain compact doit le REMPLACER, jamais en empiler un 2e.
      if (eleveEtatOn && messages[1]?.role === "system" && messages[1]?.content.startsWith("ÉTAT DE TRAVAIL")) {
        stateMsgIndex = 1;
      }
      // (🟠5) Réconcilier l'état de travail avec la trace restaurée : les fichiers
      // écrits AVANT l'interruption restent visibles du prochain état compact
      // (sinon il annoncerait « aucun fichier écrit » face à un transcript qui
      // montre l'inverse).
      if (eleveEtatOn) workingState = { ...workingState, fichiersEcrits: filesFromTrace(toolTrace) };
      messages.push({
        role: "user",
        content:
          "↩ REPRISE après interruption : l'espace de travail a PU changer depuis. AVANT de continuer, " +
          "re-vérifie l'état réel (list_files / check_build) ; si tu suivais un plan (outil planifier), " +
          "re-pose-le d'abord — il n'a pas survécu à l'interruption. Puis reprends exactement là où tu en étais.",
      });
      opts.onLog?.(`↩ Reprise du run à l'itération ${startIter} (snapshot).`);
    }
  }

  for (let iter = startIter; iter < maxIter; iter++) {
    // Interruption coopérative (clic « Stop ») : on sort sur la frontière
    // d'itération, AVANT de relancer le modèle ou d'exécuter un outil → aucun
    // état corrompu, et on rend la main tout de suite. `aborted` signale à
    // l'appelant que c'est volontaire (ne pas escalader vers Claude).
    if (opts.shouldAbort?.()) {
      opts.onLog?.("⏹ Arrêt demandé — l'Élève s'arrête proprement.");
      clearRunSnapshot();
      return { text: "", toolTrace, finished: false, iterations: iter, stuck: false, aborted: true };
    }
    // (B0.3) Frontière d'itération : snapshot AVANT compact (on veut l'état tel
    // que le modèle l'a laissé, pas déjà tronqué).
    if (eleveResumeOn && opts.projectDir) {
      saveSnapshot(opts.projectDir, {
        version: 2,
        ts: Date.now(),
        iter,
        user,
        hasWritten,
        messages: snapshotMessages(messages), // (🟠4) tool_calls compressés — la compaction ne les compte pas
        toolTrace: snapshotTrace(toolTrace), // (🟠4) borné — jamais les contenus complets
      });
    }
    const didCompact = compact(messages, ctxMax);
    // (B0.2) La compaction a tronqué du contexte : compense en (ré)insérant l'état
    // de travail compact JUSTE APRÈS le system initial (index 1) — jamais empilé.
    if (eleveEtatOn && didCompact) {
      const formatted = formatWorkingState(workingState);
      if (stateMsgIndex === null) {
        messages.splice(1, 0, { role: "system", content: formatted });
        stateMsgIndex = 1;
      } else {
        messages[stateMsgIndex].content = formatted;
      }
    }
    // (B0.1, 2026-07-03) Garde de BUDGET explicite (opt-in) : au-delà du poids
    // contexte ou du nombre d'appels d'outils autorisés, on conclut par la même
    // porte douce que le plafond d'itérations — un garde-fou de COÛT distinct du
    // simple nombre de tours. Sans `budget`, ce bloc est inerte (rétrocompat).
    if (opts.budget) {
      const overChars = opts.budget.maxPromptChars !== undefined && totalChars(messages) > opts.budget.maxPromptChars;
      const overCalls = opts.budget.maxToolCalls !== undefined && toolTrace.length >= opts.budget.maxToolCalls;
      if (overChars || overCalls) {
        opts.onLog?.(`⚠ Budget de boucle atteint (${overChars ? "poids contexte" : "appels d'outils"}) — conclusion forcée.`);
        messages.push({
          role: "user",
          content: "Budget atteint. Conclus à partir de ce que tu as déjà fait, sans appeler d'outil.",
        });
        const capped = await opts.post(messages, null);
        clearRunSnapshot(); // (🟠3) sortie TERMINALE : la reprise est pour les crashs, pas pour rejouer un run épuisé
        return { text: capped.content, toolTrace, finished: false, iterations: iter + 1, stuck: false, budgetExhausted: true };
      }
    }
    // (B1.2) RÉFLEXION explicite avant l'appel principal : le modèle prend du
    // recul (un tour sans outils) toutes les REFLEXION_EVERY itérations, OU après
    // un blocage (échecs consécutifs). Bornée REFLEXION_MAX/run, jamais deux tours
    // de suite (lastReflexionIter). Le « point » reste dans le contexte (message
    // assistant) → le raisonnement suivant en bénéficie.
    if (eleveReflexionOn && reflexionsCount < REFLEXION_MAX && iter > 0 && iter !== lastReflexionIter + 1) {
      const periodic = iter % REFLEXION_EVERY === 0;
      const bloque = errorStreak >= 3;
      if (periodic || bloque) {
        reflexionsCount++;
        lastReflexionIter = iter;
        messages.push({
          role: "user",
          content:
            "Fais le POINT en 3 à 5 lignes, SANS appeler d'outil : (1) ce qui est ACQUIS, " +
            "(2) ce qui BLOQUE s'il y a lieu, (3) la PROCHAINE étape concrète. Puis reprends.",
        });
        const refl = await opts.post(messages, null);
        messages.push({ role: "assistant", content: refl.content });
        opts.onLog?.(`💭 Réflexion ${reflexionsCount}/${REFLEXION_MAX}${bloque ? " (après blocage)" : ""}`);
      }
    }
    const { content, toolCalls } = await opts.post(messages, tools);
    // Fallback tool-calling (parité avec askEleveAgentic/contract.ts) : des modèles
    // locaux (ex. qwen2.5-coder) écrivent l'appel en TEXTE JSON dans `content` au lieu
    // d'émettre un tool_calls structuré → on le coerce vers un outil CONNU seulement,
    // sinon le moteur croit à tort que le cerveau a conclu (0 appel → plateau).
    let effectiveCalls = toolCalls;
    let assistantContent = content;
    if (!effectiveCalls?.length) {
      const coerced = coerceTextToolCall(content, tools?.map((t) => t.function.name) ?? []);
      if (coerced) {
        effectiveCalls = [{ id: `call_coerced_${iter}`, function: { name: coerced.name, arguments: coerced.arguments } }];
        assistantContent = "";
      }
    }
    messages.push({ role: "assistant", content: assistantContent, ...(effectiveCalls?.length ? { tool_calls: effectiveCalls } : {}) });

    // Le modèle ne demande plus d'outil : il a conclu (sans `finish` explicite).
    if (!effectiveCalls?.length) {
      clearRunSnapshot();
      return { text: content, toolTrace, finished: false, iterations: iter + 1, stuck: false };
    }

    for (const tc of effectiveCalls) {
      const name = tc.function.name;
      const rawArgs = tc.function.arguments || "{}";
      toolTrace.push({ name, args: rawArgs });
      opts.onTool?.(name, rawArgs);

      // Fin propre et explicite.
      if (name === FINISH_TOOL) {
        let summary = "";
        try {
          summary = (await registry.invoke(name, JSON.parse(rawArgs) as Record<string, unknown>)).text;
        } catch {
          summary = "Terminé.";
        }
        if (opts.projectDir) {
          appendBacklog(opts.projectDir, { actor: opts.actorLabel ?? "Élève", action: "finish", detail: summary, ok: true });
        }
        clearRunSnapshot();
        return { text: summary, toolTrace, finished: true, iterations: iter + 1, stuck: false };
      }

      const key = `${name}:${rawArgs}`;

      // #3 — anti-relecture : un outil de LECTURE déjà appelé à l'identique → on ne
      // relit pas (ça brûle les itérations sans rien construire), on POUSSE à agir.
      if (readOnly.has(name) && readKeys.has(key)) {
        corrections++;
        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: guardNudge(
            "⚠ Tu as DÉJÀ lu ceci plus haut — ne le relis pas. AGIS maintenant : edit_file/write_file pour " +
              "la modification demandée, ou finish si la tâche est faite.",
          ),
        });
        if (corrections >= maxCorrections) {
          opts.onLog?.("⚠ Élève bloqué (relectures répétées) — sortie contrôlée.");
          clearRunSnapshot(); // (🟠3) ne jamais restaurer un transcript qui a fini bloqué
          return { text: "", toolTrace, finished: false, iterations: iter + 1, stuck: true };
        }
        continue;
      }

      // Anti-exploration-stérile : trop de lectures (même DISTINCTES, même réussies)
      // sans une seule écriture ne fait PAS avancer. Au seuil, on refuse la lecture et
      // on POUSSE à agir — la garde qui manquait pour les blocages GLM en sur-exploration.
      if (readOnly.has(name) && readsSinceWrite >= exploreMax) {
        corrections++;
        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: guardNudge(
            `⚠ Tu as exploré ${readsSinceWrite} fois d'affilée SANS écrire une seule ligne. Explorer ne ` +
              "termine pas la tâche. ÉCRIS MAINTENANT : write_file/edit_file pour la modification demandée " +
              "(ou delegate une partie, ou finish si c'est déjà fait). N'appelle plus read_file/list_files/search_code.",
          ),
        });
        if (corrections >= maxCorrections) {
          opts.onLog?.("⚠ Élève bloqué (exploration sans action) — sortie contrôlée.");
          clearRunSnapshot(); // (🟠3)
          return { text: "", toolTrace, finished: false, iterations: iter + 1, stuck: true };
        }
        continue;
      }

      // Anti-répétition : même appel identique au-delà de la limite → on n'exécute
      // plus, on injecte un correctif. Si ça persiste → sortie contrôlée (échec).
      const count = (seen.get(key) ?? 0) + 1;
      seen.set(key, count);
      let resultText: string;
      let isErr = false;
      if (count > repeatLimit) {
        corrections++;
        isErr = true;
        resultText =
          "⚠ Tu répètes le même appel sans progresser. Change d'approche : lis un autre fichier, " +
          "appelle check_build pour voir l'état réel, ou appelle finish si la tâche est faite.";
      } else {
        try {
          // (#172) Passage par les hooks PreToolUse/PostToolUse — gaté ELEVE_HOOKS ; sans
          // hooks actifs, runGatedInvoke fait une invocation directe (comportement inchangé).
          const gated = await runGatedInvoke(registry, name, JSON.parse(rawArgs) as Record<string, unknown>, {
            hooks: opts.hooks,
            projectDir: opts.projectDir,
            enabled: process.env.ELEVE_HOOKS === "on",
            actorLabel: opts.actorLabel,
          });
          resultText = gated.text;
          isErr = gated.isError;
        } catch (e) {
          resultText = `Erreur outil "${name}" : ${(e as Error).message}`;
          isErr = true;
        }
      }
      // Anti-tâtonnement : des outils qui échouent À LA SUITE (typiquement run_command
      // shell sous Windows pour LIRE un fichier) → on coupe court et on réoriente vers
      // les bons outils. Alimente `corrections` → la sortie contrôlée finit par fermer.
      if (isErr) {
        errorStreak++;
        if (errorStreak >= 3) {
          corrections++;
          errorStreak = 0;
          resultText +=
            "\n\n⚠ Plusieurs outils ont échoué de suite. Tu es sous Windows : pour LIRE un fichier, utilise " +
            "read_file (jamais cat/ls/type/Get-Content). Arrête de tâtonner — fais directement ton edit " +
            "(edit_file/write_file), ou appelle finish si la tâche est faite.";
        }
      } else {
        errorStreak = 0;
      }
      if (readOnly.has(name) && !isErr) {
        readKeys.add(key); // #3 — mémorise la lecture réussie
        readsSinceWrite++; // … et compte vers le budget d'exploration
      }
      if (writeTools.has(name) && !isErr) {
        // 🟡 (revue #13.3) Anti-exploration : ne réinitialiser que si l'écriture est
        // substantielle (delta minimal). Sinon un write_file trivial (1 char) rouvre le budget.
        // NB : mesurer sur `rawArgs` (les arguments d'APPEL, ex. le `content` de write_file),
        // PAS sur `resultText` (le message de confirmation de l'outil, dont la longueur est
        // quasi constante quelle que soit la taille réelle écrite — ça aurait rendu le seuil
        // inopérant, un write d'1 caractère produisant déjà >10 caractères de confirmation).
        const writtenBytes = rawArgs.length;
        if (writtenBytes >= 40) {
          readsSinceWrite = 0; // une action sérieuse remet le budget à zéro
        }
        hasWritten = true; // (L17) on a produit du concret → le cue « appelle finish » s'active
      }
      // (B0.2) Accumule cet appel dans l'état de travail (gate off → jamais calculé).
      if (eleveEtatOn) {
        let parsedArgs: Record<string, unknown> = {};
        try {
          parsedArgs = JSON.parse(rawArgs) as Record<string, unknown>;
        } catch {
          // args illisibles → on accumule quand même l'événement, sans chemin de fichier
        }
        workingState = updateWorkingState(workingState, name, parsedArgs, isErr, opts.planReminder?.());
      }
      // (N10, nuit 2026-07-03) Troncature MARQUÉE : sans marqueur, le modèle croit
      // avoir lu le fichier ENTIER et le réécrit amputé (régression invisible au tsc
      // si la syntaxe reste valide). On lui dit quoi faire à la place.
      const clipped =
        resultText.length > maxToolResult
          ? resultText.slice(0, maxToolResult) +
            `\n…[TRONQUÉ à ${maxToolResult} car. — l'original fait ${resultText.length} car. et CONTINUE. ` +
            `Ne réécris JAMAIS ce fichier en entier depuis cette lecture partielle : relis par sections (search_code) ou utilise edit_file.]`
          : resultText;
      messages.push({ role: "tool", tool_call_id: tc.id, content: clipped });
    }

    if (corrections >= maxCorrections) {
      opts.onLog?.("⚠ Élève bloqué (appels répétés) — sortie contrôlée.");
      clearRunSnapshot(); // (🟠3)
      return { text: "", toolTrace, finished: false, iterations: iter + 1, stuck: true };
    }
  }

  // Plafond atteint : un dernier tour SANS outils pour forcer une conclusion.
  messages.push({
    role: "user",
    content: "Limite d'itérations atteinte. Conclus à partir de ce que tu as fait, sans appeler d'outil.",
  });
  const final = await opts.post(messages, null);
  clearRunSnapshot(); // (🟠3) plafond atteint = sortie terminale, comme le budget
  return { text: final.content, toolTrace, finished: false, iterations: maxIter, stuck: false };
}

// ── DÉLÉGATION : l'orchestrateur lance des SOUS-AGENTS (#146 Phase D) ─────────
//
// Le maillon « appeler un agent » : un sous-agent = une instance bornée du MÊME
// buildAgentic. Élégance clé : `delegate` n'est qu'UN OUTIL DE PLUS dans le
// registre — quand le cerveau l'appelle, son handler relance runAgenticTask sur
// la sous-tâche (profondeur +1) et renvoie le résumé. buildAgentic n'a rien à
// savoir de la délégation : il invoque `delegate` comme n'importe quel outil.
// Récursion bornée par la PROFONDEUR (depth/maxDepth) et un BUDGET PARTAGÉ de
// sous-agents (budget.spawned/max), tout deux passés par référence vers le bas.

export const DELEGATE_TOOL = "delegate";

/** Phase E3 — overrides de contexte pour un sous-agent doté de SON propre cerveau
 * (résolus par intention/agentType). Injecté par eleve.ts ; le runtime reste pur. */
export interface DelegateOverride {
  system?: string;
  post?: PostFn;
  buildRegistry?: (projectDir: string) => ToolRegistry;
  buildUser?: (subtask: string) => string;
  allowDelegate?: boolean;
  label?: string; // nom lisible du cerveau du sous-agent (trace)
}

export interface AgenticRunCtx {
  projectDir: string;
  /** System de base (coquille complète + contrat d'outils). */
  system: string;
  post: PostFn;
  /** Fabrique du registre d'outils d'action (= buildEleveActionTools). Injectée
   * pour garder ce module PUR (aucun import d'eleve.ts). */
  buildRegistry: (projectDir: string) => ToolRegistry;
  /** Construit le prompt user d'une (sous-)tâche (= buildEleveUser …, agentic). */
  buildUser: (subtask: string) => string;
  depth: number;
  maxDepth: number;
  /** Budget PARTAGÉ (même objet à tous les niveaux) : borne le nb total de sous-agents. */
  budget: { spawned: number; max: number };
  /** Phase E3 — false → l'outil delegate n'est PAS proposé (cerveau faible : on
   * protège de la récursion). Défaut = autorisé. */
  allowDelegate?: boolean;
  /** Phase E3 — résout le cerveau d'un sous-agent depuis son agentType (= intention).
   * Absent → le sous-agent hérite du cerveau du parent (comportement Phase D). */
  resolveDelegateCtx?: (agentType: string) => DelegateOverride | null;
  tracer?: KernelTracer;
  maxIterations?: number;
  onTool?: (name: string, args: string) => void;
  onLog?: (line: string) => void;
  /** (#160/L17) Rappel compact du plan de l'Élève (closure) — réinjecté dans les
   * gardes anti-sur-exploration de buildAgentic. Hérité tel quel par les sous-agents. */
  planReminder?: () => string;
  /** Interruption coopérative (Stop) — hérité tel quel par les sous-agents délégués. */
  shouldAbort?: () => boolean;
  /** (#172) Hooks résolus, hérités par la boucle et les sous-agents. Injectés par eleve.ts. */
  hooks?: HookRegistration[];
  /** (B0.1 câblé — revue Fable 🟠1) Budget explicite de la boucle (poids contexte /
   * appels d'outils), transmis à buildAgentic. Hérité par les sous-agents (chacun
   * a SA boucle donc SON compteur, mais le même plafond). Absent = inerte. */
  loopBudget?: { maxPromptChars?: number; maxToolCalls?: number };
  /** (#180 É2) Acteur pilotant ce run, transmis à buildAgentic et hérité par les
   * sous-agents délégués. Absent → contexte ambiant / `interactive`. */
  actor?: Actor;
  /** (#183) Étiquette lisible de l'acteur, transmise à buildAgentic pour la boîte
   * noire projet. Absent → "Élève" (comportement historique). */
  actorLabel?: string;
}

/** Lance la boucle agentique sur `user`, en injectant l'outil `delegate` tant
 * qu'on n'a pas atteint la profondeur max. Trace chaque niveau (span imbriqué). */
export async function runAgenticTask(user: string, ctx: AgenticRunCtx): Promise<AgenticBuildResult> {
  const registry = ctx.buildRegistry(ctx.projectDir);
  // Délégation proposée seulement si autorisée (cerveau fort) ET sous la profondeur max.
  if (ctx.allowDelegate !== false && ctx.depth < ctx.maxDepth) registry.register(makeDelegateTool(ctx));

  const runOnce = () =>
    buildAgentic(ctx.system, user, registry, {
      post: ctx.post,
      maxIterations: ctx.maxIterations,
      onTool: ctx.onTool,
      onLog: ctx.onLog,
      planReminder: ctx.planReminder,
      shouldAbort: ctx.shouldAbort,
      hooks: ctx.hooks,
      projectDir: ctx.projectDir,
      budget: ctx.loopBudget, // (🟠1) le fusible de coût existe enfin en prod
      snapshots: ctx.depth === 0, // (🟠2) seul le parent snapshotte — les sous-agents n'écrasent plus sa reprise
      actor: ctx.actor, // (#180 É2) palier de périmètre — hérité par les sous-agents
      actorLabel: ctx.actorLabel, // (#183) boîte noire projet — hérité par les sous-agents
    });

  if (!ctx.tracer) return runOnce();
  return ctx.tracer.withSpan(`eleve.agentic.d${ctx.depth}`, () => runOnce(), { attributes: { depth: ctx.depth } });
}

/** L'outil `delegate` : confie une sous-tâche à un sous-agent borné. */
function makeDelegateTool(ctx: AgenticRunCtx): KernelTool {
  return {
    name: DELEGATE_TOOL,
    description:
      "Délègue une SOUS-TÂCHE bien bornée et autonome à un sous-agent sur le même projet. " +
      "Optionnel : agentType (construire|planifier|discuter) confie la sous-tâche au CERVEAU adapté à cette intention " +
      "(ex. un spécialiste code) ; sans agentType, le sous-agent emploie ton propre cerveau. " +
      "Personas dédiées — builder : implémente UNE partie bien bornée (section/composant/page) en parallèle d'autres builders, PAS d'accès run_command (évite les conflits npm/serveur dev) ; " +
      "controleur : audit adversarial d'une app DÉJÀ CONSTRUITE (cas limites, états manquants, a11y, bugs) et CORRIGE sans ajouter de fonctionnalité, PAS d'accès run_command non plus. " +
      "Renvoie le résumé du sous-agent.",
    inputSchema: {
      subtask: z.string().describe("La sous-tâche précise et autonome à confier au sous-agent"),
      agentType: z.string().optional().describe("construire | planifier | discuter (change de cerveau) — ou builder | controleur (persona + toolset restreint, même cerveau)"),
    },
    handler: async (args) => {
      const a = args as Record<string, unknown>;
      const subtask = String(a.subtask ?? "").trim();
      const agentType = String(a.agentType ?? "").trim();
      if (!subtask) return { text: "sous-tâche vide", isError: true };
      if (ctx.budget.spawned >= ctx.budget.max) {
        return {
          text: `budget de sous-agents épuisé (${ctx.budget.max}) — réalise cette sous-tâche toi-même avec tes outils.`,
          isError: true,
        };
      }
      ctx.budget.spawned++;
      // Phase E3 — le sous-agent peut prendre SON cerveau selon agentType (résolveur
      // injecté). Sinon il hérite du cerveau du parent (Phase D).
      let subCtx: AgenticRunCtx = { ...ctx, depth: ctx.depth + 1 };
      let brainNote = "";
      if (agentType && ctx.resolveDelegateCtx) {
        const ov = ctx.resolveDelegateCtx(agentType);
        if (ov) {
          subCtx = { ...subCtx, ...ov };
          brainNote = ov.label ? ` [cerveau: ${ov.label}]` : ` [${agentType}]`;
        }
      }
      const buildUser = subCtx.buildUser ?? ctx.buildUser;
      ctx.onLog?.(`  ↳ délégation #${ctx.budget.spawned} (profondeur ${ctx.depth + 1})${brainNote} : ${subtask.slice(0, 80)}`);
      const sub = await runAgenticTask(buildUser(subtask), subCtx);
      const head = sub.finished ? "✓ sous-agent terminé" : sub.stuck ? "⚠ sous-agent bloqué" : "⚠ sous-agent non conclu";
      return { text: `${head}${brainNote} : ${sub.text || "(pas de résumé)"}` };
    },
  };
}
