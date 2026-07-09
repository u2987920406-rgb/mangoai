// Auto-déclenchement de la spéculation (#171, dernière pièce) — le PRÉ-PASSE spéculatif.
// Avant la boucle séquentielle, l'Élève (cerveau frugal) DRAFTE une séquence d'étapes (slice 2),
// on l'exécute en WORKTREE isolé et on APPLIQUE le préfixe accepté (slice 3). La boucle normale
// reprend ensuite depuis l'état appliqué. Gaté `ELEVE_SPECULATIVE=on` côté appelant ; ici on
// expose une fonction pure-ish (deps injectées) qui ne lève jamais.
import { draftSteps } from "./eleve-speculative-runner.js";
import { runSpeculativeInWorktree, appSpecExecDeps, type SpecExecDeps } from "./eleve-speculative-exec.js";
import { askLLM } from "../llm/llm-engine.js";
import { sanitizeSelfSlug } from "../mango-self.js";

// Outils que l'Élève peut drafter. DOIVENT correspondre EXACTEMENT aux outils réellement exposés
// dans le worktree par buildSelfRegistry (SELF_ALLOWED_TOOLS + check_types), sinon une étape diverge
// sur un nom inconnu. (Bug d'intégration corrigé 2026-06-30 : check_build/teste_parcours n'existent pas.)
export const SPECULATIVE_TOOLS = ["read_file", "list_files", "search_code", "write_file", "edit_file", "check_types"];

export interface PrepassDeps {
  ask: (system: string, user: string) => Promise<string>;
  exec: SpecExecDeps;
  toolNames: string[];
}

export function realPrepassDeps(projectDir: string): PrepassDeps {
  return {
    // budget de tokens généreux : un draft de plusieurs étapes a besoin de place (cf. quirk slice 2).
    ask: (system, user) =>
      askLLM(system, user, {
        provider: "openai",
        model: process.env.ELEVE_MODEL || "glm-5.2:cloud",
        baseUrl: process.env.ELEVE_API_URL,
        apiKeyEnv: "ELEVE_API_KEY",
        maxTokens: 2500,
        timeoutMs: 90_000,
      }),
    // mode APP : verify = build réel de l'app (inspectProject), pas le tsc MangoOS. Le hook vit
    // dans runRelay (génération d'app) → on vérifie et on applique CONTRE le projet généré.
    exec: appSpecExecDeps(projectDir),
    toolNames: SPECULATIVE_TOOLS,
  };
}

export interface PrepassResult {
  ran: boolean; // true si la spéculation a réellement exécuté un draft
  reason: string;
  drafted: number;
  accepted: number;
  savedRoundTrips: number;
  appliedFiles: string[];
  escalate: boolean; // divergence → la boucle séquentielle reprend la main
  summary: string;
}

const EMPTY: PrepassResult = {
  ran: false, reason: "", drafted: 0, accepted: 0, savedRoundTrips: 0, appliedFiles: [], escalate: false, summary: "",
};

/**
 * Tente une passe spéculative pour une tâche. Ne lève JAMAIS : toute défaillance → repli silencieux
 * sur le mode séquentiel (la boucle normale fait tout le travail comme avant).
 */
export async function speculativePrepass(
  task: string,
  projectDir: string,
  depth = 4,
  deps: PrepassDeps = realPrepassDeps(projectDir),
): Promise<PrepassResult> {
  let draft;
  try {
    draft = await draftSteps({ ask: deps.ask }, task, depth, deps.toolNames);
  } catch {
    return { ...EMPTY, reason: "draft impossible" };
  }
  if (!draft.length) return { ...EMPTY, reason: "aucun draft exploitable" };

  const slug = sanitizeSelfSlug(`spec-${task}`) || "spec";
  let r;
  try {
    r = await runSpeculativeInWorktree(projectDir, slug, draft, deps.exec);
  } catch (e) {
    return { ...EMPTY, drafted: draft.length, reason: `exécution spéculative impossible : ${e instanceof Error ? e.message : String(e)}` };
  }
  if (!r.ok) return { ...EMPTY, drafted: draft.length, reason: r.reason };

  return {
    ran: true,
    reason: r.reason,
    drafted: r.drafted,
    accepted: r.accepted,
    savedRoundTrips: r.savedRoundTrips,
    appliedFiles: r.appliedFiles,
    escalate: r.divergedAt !== null,
    summary: r.summary,
  };
}
