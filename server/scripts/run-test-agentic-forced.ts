// TEST — Forcer le MOTEUR AGENTIQUE avec un cerveau LOCAL (qwen2.5-coder:14b),
// en lui prêtant le profil GLM (agentic:true), pour valider que le moteur agentique
// DÉMARRE et tourne mécaniquement avec un provider Ollama (indépendamment de la
// qualité du cerveau). Objectif : savoir si GLM 5.2 butera sur un bug mécanique.
// 1 seule app (solaire). Filet Claude OFF. Lancer : npx tsx scripts/run-test-agentic-forced.ts
import "dotenv/config";
import { createProject, projectDir, projectExists } from "../src/projects.js";
import { runRelay, defaultRelayDeps } from "../src/eleve.js";
import { glmProfile } from "../src/models/glm.js";

function log(m: string): void { console.log(`[${new Date().toISOString()}] ${m}`); }

const eleveOnlyDeps = { ...defaultRelayDeps, escalate: async () => ({ axiom: false, costUsd: 0, codeChanged: false }) };

const NAME = "solaire-agentic";
const TASK =
  "Crée un simulateur 3D interactif du système solaire (Three.js via @react-three/fiber, déjà dans le template). " +
  "Soleil + planètes avec orbites animées, clic sur une planète → fiche d'infos, contrôle de vitesse, caméra OrbitControls. " +
  "Palette bleu-nuit (jamais #000). `npm run build` DOIT passer.";

async function main(): Promise<void> {
  log("═══ TEST moteur agentique FORCÉ · Élève=qwen2.5-coder:14b + profil GLM (agentic:true) · filet OFF ═══");
  const dir = projectDir(NAME);
  if (!projectExists(NAME)) { await createProject(NAME, "r3f"); log("✓ scaffoldé"); }
  const t0 = Date.now();
  try {
    const r = await runRelay(
      TASK,
      dir,
      { provider: "ollama", eleveModel: "qwen2.5-coder:14b", profile: glmProfile, maxEleveAttempts: 2, onLog: (l) => log(`  [relay] ${l}`) },
      eleveOnlyDeps,
    );
    log(`▶ RÉSULTAT : success=${r.success} · resolvedBy=${r.resolvedBy} · attempts=${r.attempts} · incomplete=${r.incomplete ?? false} · signal=${r.inspection?.signal} · ${Math.round((Date.now() - t0) / 1000)}s`);
  } catch (e) {
    log(`✗ runRelay a levé : ${(e as Error).message}`);
  }
  log("═══ FIN ═══");
}
main().catch((e) => { log(`FATAL: ${(e as Error).stack ?? e}`); process.exit(1); });
