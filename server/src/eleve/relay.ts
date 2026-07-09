// Boucle de relais Maître/Élève (Phase Ultime, Jalon D — le « rouage de la
// bascule »). Séquenceur : résout la config, pose les dépendances, puis délègue
// aux PHASES extraites (relay-config/finalize/agentic/contract). Le corps de
// chaque phase est du code EXTRAIT VERBATIM — aucun changement de comportement.
//   1. L'Élève (modèle OSS local) tente à coût zéro ; 2. MangoOS applique & juge ;
//   3. build vert → succès Élève ; 4. après MAX échecs → escalade Maître (Claude).
import fs from "node:fs";
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
};

export async function runRelay(
  task: string,
  projectDir: string,
  opts: RelayOptions = {},
  deps: RelayDeps = defaultRelayDeps,
): Promise<RelayResult> {
  // Config résolue (surcharge par appel + ENV) — corps extrait dans relay-config.
  const cfg = resolveRelayConfig(task, projectDir, opts, deps);
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
    return await runAgenticEngine(ctx);
  }

  // ── Chemin CONTRAT (exploration agentique optionnelle + boucle de tentatives). ──
  return await runContractPath(ctx);
}
