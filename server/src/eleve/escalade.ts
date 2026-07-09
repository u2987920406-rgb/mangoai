// Escalade vers le Maître (Claude) — extraite de eleve.ts (chantier archi #3).
// Importe provider (PROFILE) + git-signals + types ; jamais relay.
import path from "node:path";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { axiomsFingerprint } from "../axioms.js";
import { WORKSPACE_DIR } from "../projects.js";
import { gitDirtyPaths, hasRealCodeChange } from "../git-signals.js";
import { PROFILE } from "./provider.js";
import { type EscalationContext } from "./types.js";

// ── Cerveau Maître par défaut : Claude corrige + écrit l'axiome ────────────────
const ESCALATE_SYSTEM = `Tu es le MAÎTRE dans l'apprentissage de MangoOS. Un modèle
ÉLÈVE local a tenté une tâche et a ÉCHOUÉ à une vérification OBJECTIVE (le build ne
passe pas). Deux missions, dans l'ordre :
1. CORRIGE le projet pour que "npm run build" passe — changement minimal et correct,
   pas de refonte. Tu peux lire/éditer les fichiers et lancer le build pour vérifier.
2. Puis distille EXACTEMENT UN axiome universel dans le registre .axioms.md (à la
   racine du workspace) expliquant le PIÈGE qui a fait trébucher l'Élève — la
   RÈGLE/le POURQUOI, jamais le code. Format, en français, une ligne vide entre axiomes :
     AXIOME-[CAT]-[NN] (maturité: candidat · vu: AAAA-MM-JJ)
     - Contexte : intention générale d'ingénierie/UX
     - Piège : le piège invisible
     - Règle d'or : la règle universelle verrouillante
   CAT ∈ {VISION,UIUX,ARCH,DATA,PERF,A11Y,BUILD}. Un nouvel axiome est TOUJOURS
   "candidat". Plafond ~12 axiomes / 3000 car. : fusionne plutôt que gonfler.
Ne touche à aucun fichier hors du projet et du registre d'axiomes.`;

// #1 — Mode « terminer » : l'Élève s'est arrêté sans conclure (build vert mais tâche
// incomplète). Le Maître ne répare pas un build cassé, il TERMINE la tâche.
const ESCALATE_FINISH_SYSTEM = `Tu es le MAÎTRE dans MangoOS. Un modèle ÉLÈVE local a
travaillé sur une tâche mais s'est ARRÊTÉ AVANT DE LA TERMINER (sur-exploration /
limite atteinte). Le build PASSE déjà, mais la modification demandée n'est probablement
PAS complète. Deux missions, dans l'ordre :
1. TERMINE la tâche demandée — complète la modification, proprement et MINIMALEMENT
   (pas de refonte). Lis/édite ce qu'il faut et lance "npm run build" pour vérifier
   qu'il passe toujours à la fin.
2. Puis distille EXACTEMENT UN axiome universel dans .axioms.md (racine du workspace)
   sur ce qui a fait CALER l'Élève (sur-exploration, indécision à passer à l'action…) —
   la RÈGLE/le POURQUOI, jamais le code. Format, en français, une ligne vide entre axiomes :
     AXIOME-[CAT]-[NN] (maturité: candidat · vu: AAAA-MM-JJ)
     - Contexte : intention générale d'ingénierie/UX
     - Piège : le piège invisible
     - Règle d'or : la règle universelle verrouillante
   CAT ∈ {VISION,UIUX,ARCH,DATA,PERF,A11Y,BUILD}. Toujours "candidat". Plafond ~12 / 3000 car.
Ne touche à aucun fichier hors du projet et du registre d'axiomes.`;

// (L112) Idle-timeout sur la consommation de query() : si AUCUN message n'arrive
// pendant idleMs, on abandonne (best-effort .return() sur l'itérateur) plutôt que
// d'attendre indéfiniment — c'est le 2ᵉ/3ᵉ cas L112 observé (claude.exe bloqué
// 20-35 min, aucun tool-call loggé). 5 min de marge : généreux pour un seul appel
// Bash légitime (npm install observé jusqu'à ~2 min dans ce run), largement en
// dessous des blocages réels observés.
const ESCALATION_IDLE_TIMEOUT_MS = 5 * 60_000;

async function consumeEscalationStream(q: AsyncIterable<{ type: string; total_cost_usd?: number }>): Promise<{ costUsd: number; timedOut: boolean }> {
  let costUsd = 0;
  let timedOut = false;
  const iterator = q[Symbol.asyncIterator]();
  for (;;) {
    const step = await Promise.race([
      iterator.next().then((r) => ({ kind: "value" as const, r })),
      new Promise<{ kind: "timeout" }>((resolve) => setTimeout(() => resolve({ kind: "timeout" }), ESCALATION_IDLE_TIMEOUT_MS)),
    ]);
    if (step.kind === "timeout") {
      timedOut = true;
      try {
        await iterator.return?.();
      } catch {
        /* best-effort — ne doit jamais faire planter l'appelant */
      }
      break;
    }
    if (step.r.done) break;
    if (step.r.value.type === "result") costUsd = step.r.value.total_cost_usd ?? 0;
  }
  return { costUsd, timedOut };
}

export async function escalateToClaude(ctx: EscalationContext): Promise<{ axiom: boolean; costUsd: number; codeChanged: boolean }> {
  // Détection de l'axiome appris sur l'UNION des fichiers de la partition (un
  // axiome rangé dans .axioms.<famille>.md compte aussi), via une empreinte NON
  // plafonnée : un nouvel axiome est appendé en fin de registre, donc au-delà du
  // cap d'injection dès que l'union est volumineuse — le diff plafonné le raterait.
  const escProfile = ctx.profile ?? PROFILE;
  const axBefore = axiomsFingerprint(WORKSPACE_DIR, escProfile.axiomFiles);
  // cwd = workspace si le projet y vit (Claude atteint code + .axioms.md en
  // relatif, comme la revue) ; sinon repli sur le projet seul.
  const rel = path.relative(WORKSPACE_DIR, ctx.projectDir).replaceAll("\\", "/");
  const inside = rel !== "" && !rel.startsWith("..");
  const cwd = inside ? WORKSPACE_DIR : ctx.projectDir;
  const projRef = inside ? rel : ".";

  const incomplete = ctx.incomplete === true;
  const prompt = [
    incomplete ? `Projet : ./${projRef}` : `Projet à réparer : ./${projRef}`,
    `Tâche demandée à l'Élève : ${ctx.task}`,
    "",
    incomplete ? "L'Élève s'est arrêté sans terminer. Ce qu'il a fait avant de caler :" : "Échec objectif constaté :",
    (incomplete ? ctx.eleveSummary || ctx.lastError : ctx.lastError) || "(pas de détail)",
    "",
    `Registre d'axiomes (.axioms.md) actuel :`,
    axBefore || "(vide)",
    "",
    incomplete
      ? "TERMINE la tâche, vérifie que le build passe, puis ajoute l'unique axiome, puis arrête-toi."
      : "Corrige le build, puis ajoute l'unique axiome, puis arrête-toi.",
    escProfile.escalateAppendix, // "" pour GENERIC → prompt inchangé
  ].join("\n");

  const filesBefore = await gitDirtyPaths(ctx.projectDir);

  const q = query({
    prompt,
    options: {
      cwd,
      model: ctx.maitreModel,
      maxTurns: 24,
      permissionMode: "acceptEdits",
      allowedTools: ["Read", "Write", "Edit", "Bash", "Glob", "Grep"],
      systemPrompt: { type: "preset", preset: "claude_code", append: incomplete ? ESCALATE_FINISH_SYSTEM : ESCALATE_SYSTEM },
    },
  });
  const { costUsd, timedOut } = await consumeEscalationStream(q);

  const axiom = axiomsFingerprint(WORKSPACE_DIR, escProfile.axiomFiles) !== axBefore;
  const filesAfter = await gitDirtyPaths(ctx.projectDir);
  const codeChanged = !timedOut && hasRealCodeChange(filesBefore, filesAfter);
  return { axiom, costUsd, codeChanged };
}
