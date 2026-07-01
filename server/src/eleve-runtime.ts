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
import { ToolRegistry, toOpenAITools, type OpenAITool, type KernelTool } from "./kernel-mcp.js";
import { FINISH_TOOL } from "./eleve-action-tools.js";
import type { KernelTracer } from "./kernel-trace.js";
import { runHooks, type HookRegistration } from "./mango-hooks.js";

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
}

/** Somme des longueurs de contenu (proxy du poids contexte). */
function totalChars(messages: ChatMessage[]): number {
  return messages.reduce((n, m) => n + (m.content?.length ?? 0), 0);
}

/** Compaction : au-delà de `ctxMax`, tronque les VIEUX résultats d'outils
 * volumineux (read_file/search_code…), en gardant intacts system, user et les
 * derniers échanges. Sans elle, une longue boucle fait exploser contexte + coût. */
function compact(messages: ChatMessage[], ctxMax: number): boolean {
  if (totalChars(messages) <= ctxMax) return false;
  let compacted = false;
  for (let i = 2; i < messages.length - KEEP_RECENT; i++) {
    const m = messages[i];
    if (m.role === "tool" && m.content.length > 200) {
      m.content = m.content.slice(0, 200) + " … [résultat compacté]";
      compacted = true;
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
export async function runGatedInvoke(
  registry: ToolRegistry,
  name: string,
  args: Record<string, unknown>,
  opts: { hooks?: HookRegistration[]; projectDir?: string; enabled?: boolean } = {},
): Promise<{ text: string; isError: boolean }> {
  const hooks = opts.hooks ?? [];
  if (!opts.enabled || hooks.length === 0) {
    const r = await registry.invoke(name, args);
    return { text: r.text, isError: !!r.isError };
  }
  const projectDir = opts.projectDir ?? "";
  const pre = await runHooks({ event: "PreToolUse", projectDir, toolName: name, toolInput: args }, hooks);
  if (pre.decision !== "allow") {
    const why = pre.reasons.join(" ; ")
      || (pre.decision === "ask" ? "confirmation requise (aucun humain dans la boucle)" : "refusé");
    return { text: `⛔ Action « ${name} » bloquée par un hook : ${why}`, isError: true };
  }
  const finalArgs = pre.updatedInput ?? args;
  const r = await registry.invoke(name, finalArgs);
  const result = { text: r.text, isError: !!r.isError };
  // PostToolUse : observation seule en V1 (le résultat est déjà produit).
  await runHooks({ event: "PostToolUse", projectDir, toolName: name, toolInput: finalArgs, result: result.text }, hooks);
  return result;
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

  for (let iter = 0; iter < maxIter; iter++) {
    // Interruption coopérative (clic « Stop ») : on sort sur la frontière
    // d'itération, AVANT de relancer le modèle ou d'exécuter un outil → aucun
    // état corrompu, et on rend la main tout de suite. `aborted` signale à
    // l'appelant que c'est volontaire (ne pas escalader vers Claude).
    if (opts.shouldAbort?.()) {
      opts.onLog?.("⏹ Arrêt demandé — l'Élève s'arrête proprement.");
      return { text: "", toolTrace, finished: false, iterations: iter, stuck: false, aborted: true };
    }
    compact(messages, ctxMax);
    const { content, toolCalls } = await opts.post(messages, tools);
    messages.push({ role: "assistant", content, ...(toolCalls ? { tool_calls: toolCalls } : {}) });

    // Le modèle ne demande plus d'outil : il a conclu (sans `finish` explicite).
    if (!toolCalls?.length) {
      return { text: content, toolTrace, finished: false, iterations: iter + 1, stuck: false };
    }

    for (const tc of toolCalls) {
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
        readsSinceWrite = 0; // une action remet le budget à zéro
        hasWritten = true; // (L17) on a produit du concret → le cue « appelle finish » s'active
      }
      messages.push({ role: "tool", tool_call_id: tc.id, content: resultText.slice(0, maxToolResult) });
    }

    if (corrections >= maxCorrections) {
      opts.onLog?.("⚠ Élève bloqué (appels répétés) — sortie contrôlée.");
      return { text: "", toolTrace, finished: false, iterations: iter + 1, stuck: true };
    }
  }

  // Plafond atteint : un dernier tour SANS outils pour forcer une conclusion.
  messages.push({
    role: "user",
    content: "Limite d'itérations atteinte. Conclus à partir de ce que tu as fait, sans appeler d'outil.",
  });
  const final = await opts.post(messages, null);
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
      "(ex. un spécialiste code) ; sans agentType, le sous-agent emploie ton propre cerveau. Renvoie le résumé du sous-agent.",
    inputSchema: {
      subtask: z.string().describe("La sous-tâche précise et autonome à confier au sous-agent"),
      agentType: z.string().optional().describe("Intention du sous-agent : construire | planifier | discuter (optionnel)"),
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
