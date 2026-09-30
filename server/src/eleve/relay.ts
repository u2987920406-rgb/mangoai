// Boucle de relais Maître/Élève (Phase Ultime, Jalon D — le « rouage de la
// bascule »). Séquenceur : résout la config, pose les dépendances, puis délègue
// aux PHASES extraites (relay-config/finalize/agentic/contract). Le corps de
// chaque phase est du code EXTRAIT VERBATIM — aucun changement de comportement.
//   1. L'Élève (modèle OSS local) tente à coût zéro ; 2. MangoOS applique & juge ;
//   3. build vert → succès Élève ; 4. après MAX échecs → escalade Maître (Claude).
import fs from "node:fs";
import { turnStartedAtMs } from "../turn-ledger.js";
import path from "node:path";
import { spawn } from "node:child_process";
import { inspectProject, type Inspection } from "../inspection.js";
import { hasBackend, BACKEND_DIR_NAME } from "../backend-generator.js";
import { supportsTools } from "./contract.js";
import { askEleveDispatch } from "./provider.js";
import { escalateToClaude } from "./escalade.js";
import { type RelayResult, type RelayOptions, type RelayDeps } from "./types.js";
import { resolveRelayConfig, type RelayContext } from "./relay-config.js";
import { finalizeEscalationPhase } from "./relay-finalize.js";
import { runAgenticEngine } from "./relay-agentic.js";
import { runContractPath } from "./relay-contract.js";
import { getLLMRun } from "../llm/llm-usage.js";
import { startChatTurn, finishChatTurn } from "../kernel/kernel-chat-bridge.js";

/** D1 (audit 2026-09-28, B4) — LA LECTURE du compteur de consommation, qui manquait :
 *  `startLLMRun` ouvrait un compteur et `getLLMRun()` n'était appelé par AUCUN code de
 *  production (seulement les tests), donc la consommation restait invisible malgré un
 *  comptage correct. Ici, à la frontière du build : quelle que soit la phase qui a
 *  tourné (moteur agentique OU chemin contrat), le total du run est poussé dans le fil
 *  — et le journal `LLM_USAGE_LOG` le persiste. Avec le détail par modèle : c'est ce
 *  qui rend « quel modèle sur quel rôle » mesurable, préalable à toute promotion de
 *  gate (D6) qui prétend comparer un AVANT/APRÈS. Ne lève jamais, n'écrit rien hors
 *  du gate de journal. */
export function journaliserConsommation(push: (s: string) => void): void {
  try {
    const u = getLLMRun();
    if (!u || u.calls === 0) return;
    const parModele = Object.entries(u.byModel)
      .map(([m, v]) => `${m} ${v.totalTokens} jt/${v.calls} appels`)
      .join(", ");
    push(
      `📊 Consommation du build : ${u.totalTokens} jetons sur ${u.calls} appel(s)` +
        ` (${u.promptTokens} entrée / ${u.completionTokens} sortie)` +
        `${u.unmeasuredCalls ? `, ${u.unmeasuredCalls} non mesuré(s)` : ""}` +
        `${parModele ? ` — ${parModele}` : ""}`,
    );
  } catch {
    /* mesurer ne doit jamais gêner le build */
  }
}

async function npmInstallIfNeeded(dir: string, log: (s: string) => void, label: string): Promise<void> {
  if (fs.existsSync(path.join(dir, "node_modules"))) return;
  if (!fs.existsSync(path.join(dir, "package.json"))) return;
  log(`npm install (${label})…`);
  await new Promise<void>((resolve) => {
    const p = spawn("npm install", { cwd: dir, shell: true, windowsHide: true });
    p.on("exit", () => resolve());
    p.on("error", () => resolve());
  });
}

async function ensureDepsNpm(projectDir: string, log: (s: string) => void): Promise<void> {
  await npmInstallIfNeeded(projectDir, log, "dépendances manquantes");
  // Projet full-stack : le backend généré (api/) a son propre package.json et
  // doit être installé pour que l'inspection (tsc --noEmit) ne renvoie pas un
  // faux "backend-no-deps". hasBackend est false tant que l'Élève n'a pas créé
  // api/ → cet appel n'installe le backend qu'une fois qu'il existe.
  if (hasBackend(projectDir)) {
    await npmInstallIfNeeded(path.join(projectDir, BACKEND_DIR_NAME), log, "backend api/");
  }
}

export const defaultRelayDeps: RelayDeps = {
  askEleve: askEleveDispatch,
  inspect: inspectProject,
  ensureDeps: ensureDepsNpm,
  escalate: escalateToClaude,
  // Juge de la porte FONCTIONNELLE (#104), enfin branché par défaut (audit dormant #11) : avant, seule
  // scripts/run-learn.ts en injectait un, donc « build vert ≠ app vide » ne se vérifiait jamais. Import
  // dynamique : nocturnal.ts importe eleve.ts (cycle). Fail-open : sans verdict (pas de source, juge
  // injoignable) la porte ne bloque rien.
  judge: async (dir, task) => {
    const { judgeProject } = await import("../nocturnal.js");
    const j = await judgeProject(dir, task);
    return j ? { fonctionnel: j.dims.fonctionnel, note: j.comment } : null;
  },
};

async function runRelayCore(
  task: string,
  projectDir: string,
  opts: RelayOptions = {},
  deps: RelayDeps = defaultRelayDeps,
): Promise<RelayResult> {
  // Config résolue (surcharge par appel + ENV) — corps extrait dans relay-config.
  // CHANTIER 5b — HEAD du projet AVANT le tour. Les projets COMMITTENT leur travail
  // (commitVersion) : au moment de l'escalade, `git status` est donc PROPRE et
  // l'ancien controle (dirty + Maitre seul) voyait « aucun fichier modifie » sur un
  // jeu pourtant ecrit et JOUABLE (mesure 2026-09-29/30, 2 runs de suite).
  // CHANTIER 5b — ancre du tour : les fichiers sont crees PAR LE RUN, donc un
  // `git rev-parse` au demarrage ne voit encore aucun depot, et le tour committe son
  // travail (git status devient propre). L'horodatage de debut de tour (.turn-ledger)
  // est la seule ancre valable dans tous les cas.
  const turnStartedAt = turnStartedAtMs(projectDir);
  const cfg = { ...resolveRelayConfig(task, projectDir, opts, deps), turnStartedAt };
  const { push } = cfg;

  // Sans dépendances, l'inspection renverrait un faux "no-deps" — on les pose une fois.
  await deps.ensureDeps(projectDir, push);

  // Inspecte, et si l'Élève a généré un backend (api/) sans dépendances, les pose
  // une fois puis ré-inspecte — sinon le backend renverrait un faux "backend-no-deps".
  const inspectReady = async (): Promise<Inspection> => {
    let insp = await deps.inspect(projectDir);
    if (insp.signal === "backend-no-deps") {
      push("📦 Installation des dépendances backend (api/)…");
      await deps.ensureDeps(projectDir, push);
      insp = await deps.inspect(projectDir);
    }
    return insp;
  };

  // Escalade vers le Maître (Claude), factorisée (relay-finalize) : partagée par le
  // chemin contrat ET le chemin moteur agentique. INCHANGÉE — Claude reste le seul filet.
  const finalizeEscalation = (
    lastErr: string,
    attempts: number,
    esc2?: { incomplete?: boolean; eleveSummary?: string },
  ): Promise<RelayResult> => finalizeEscalationPhase({ ...cfg, inspectReady }, lastErr, attempts, esc2);

  const ctx: RelayContext = { ...cfg, inspectReady, finalizeEscalation };

  // ── MOTEUR AGENTIQUE (Phase 2) : cerveau fort en function-calling → boucle maison.
  // Une fois ENTRÉ, ce chemin retourne toujours (jamais de repli sur le contrat).
  if (cfg.callProfile.agentic && process.env.ELEVE_AGENTIC !== "off" && (supportsTools(cfg.callProvider) || deps.agenticPost)) {
    const r = await runAgenticEngine(ctx);
    journaliserConsommation(cfg.push); // D1 — le compteur est enfin LU (B4)
    return r;
  }

  // ── Chemin CONTRAT (exploration agentique optionnelle + boucle de tentatives). ──
  // D1 : même frontière de mesure sur ce chemin — sinon la consommation des builds
  // passés par le contrat resterait invisible (c'est précisément le défaut B4).
  const r = await runContractPath(ctx);
  journaliserConsommation(cfg.push);
  return r;
}

/**
 * Point d'entrée UNIQUE du relais Élève, désormais alimentateur du Bus de coûts.
 * Pourquoi ici (et pas dans chaque script) : runRelay est le goulot par lequel passent TOUS
 * les consommateurs réels (scripts nocturnes, train-loop, cron, grand-chantier, audit-scan,
 * design-coach). Avant, seuls le chat UI et nocturnal.ts (gate OFF) publiaient `chat.turn` :
 * le cost-guard / nightly-circuit du Disjoncteur ne voyaient rien du pipeline réel.
 * Fire-and-forget (finishChatTurn ne lève jamais) ; ne change ni le résultat ni les erreurs.
 * L'export vers .mangoqa/bus-events.jsonl (process séparé) est fait par le pont MangoQA :
 * installé par le serveur au boot, et par nightStopGate() pour les runners autonomes.
 */
export async function runRelay(
  task: string,
  projectDir: string,
  opts: RelayOptions = {},
  deps: RelayDeps = defaultRelayDeps,
): Promise<RelayResult> {
  if (opts.busTurn === false) return runRelayCore(task, projectDir, opts, deps);
  const project = path.basename(projectDir) || "projet";
  const started = Date.now();
  const span = startChatTurn({ project, mode: "relay", model: opts.eleveModel ?? "eleve" });
  try {
    const r = await runRelayCore(task, projectDir, opts, deps);
    finishChatTurn(span, {
      project, mode: "relay", model: opts.eleveModel ?? "eleve",
      ok: r.success || r.aborted === true, costUsd: r.costUsd, numTurns: r.attempts,
      durationMs: Date.now() - started, resolvedBy: r.resolvedBy === "eleve" || r.resolvedBy === "maitre" ? r.resolvedBy : "none",
      ...(r.success || r.aborted ? {} : { error: r.echecCause ?? r.inspection.signal }),
    });
    return r;
  } catch (e) {
    finishChatTurn(span, { project, mode: "relay", model: opts.eleveModel ?? "eleve", ok: false, durationMs: Date.now() - started, error: (e as Error).message });
    throw e;
  }
}
