// TEST A — Génération par le PIPELINE Mango (runRelay), Élève = qwen2.5-coder:14b (LOCAL),
// filet Claude OFF (escalade neutralisée). Mêmes 3 apps / mêmes briefs qu'hier soir,
// pour comparer « pipeline + cerveau souverain » vs « agents Claude hors-pipeline ».
// Lancer : npx tsx scripts/run-test-pipeline-qwen.ts
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { createProject, projectDir, projectExists, WORKSPACE_DIR } from "../src/projects.js";
import { runRelay, defaultRelayDeps } from "../src/eleve.js";

const RESULTS_FILE = path.join(WORKSPACE_DIR, ".test-pipeline-qwen.results.json");

function log(msg: string): void {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

// ── Filet Claude OFF : l'escalade ne fait RIEN (on veut voir l'Élève local seul) ──
const eleveOnlyDeps = {
  ...defaultRelayDeps,
  escalate: async () => ({ axiom: false, costUsd: 0, codeChanged: false }),
};

interface AppSpec { name: string; template: string; task: string; }

const APPS: AppSpec[] = [
  {
    name: "solaire-pipe",
    template: "r3f",
    task:
      "Crée un simulateur 3D interactif du système solaire (Three.js via @react-three/fiber, déjà dans le template). " +
      "ANGLE : « une station d'observation crédible — la beauté vient de la justesse scientifique, pas de l'esbroufe ». " +
      "Palette bleu-nuit profond (JAMAIS #000), un accent par astre, typo scientifique (grotesque + mono tabular pour les données). " +
      "CONTENU : Soleil + 8 planètes avec orbites animées (périodes réalistes), contrôle de vitesse temporelle (slider), caméra libre (OrbitControls) " +
      "+ focus planète au clic avec fiche latérale (masse, rayon, durée du jour, année, lunes, 2-3 faits RÉELS exacts), lunes majeures (Lune, Io/Europe/Ganymède/Callisto, Titan), " +
      "anneaux de Saturne, ceinture d'astéroïdes, champ d'étoiles de fond. Panneau latéral dense repliable. Données astronomiques EXACTES. " +
      "États : chargement, rien de sélectionné. `npm run build` DOIT passer.",
  },
  {
    name: "mindmap-pipe",
    template: "reactflow",
    task:
      "Crée une application de mind map ANALYTIQUE (React Flow / @xyflow/react, déjà dans le template). " +
      "ANGLE : « pas un mindmap décoratif — un atelier de pensée qui s'analyse lui-même ». " +
      "Palette encre profonde #0f1117 + UN accent électrique (cyan), nœuds typés par couleur sémantique (concept/question/preuve/risque), typo grotesque + mono pour les métriques. " +
      "FONCTIONS : créer/éditer/supprimer des nœuds, liens TYPÉS (cause→effet, soutient, contredit, dépend), layouts auto commutables (force-directed / hiérarchique / radial), " +
      "PANNEAU ANALYTIQUE temps réel (degré et centralité des nœuds, détection de clusters, chemin critique / profondeur, densité), recherche + filtre par type, mini-map, " +
      "export JSON + PNG, persistance localStorage, un exemple pré-chargé riche (≥ 15 nœuds, ex. « faut-il migrer notre stack ? »). Panneau dense repliable. `npm run build` DOIT passer.",
  },
  {
    name: "vitrine-pipe",
    template: "vitrine",
    task:
      "Crée un site web vitrine MODERNE et IMPACTANT pour l'écosystème MangoOS + MangoQA (React + Tailwind v4). " +
      "OBJECTIF : donner envie d'utiliser l'écosystème. Registre MODERNE et percutant, PAS artistique/atelier. " +
      "Palette : violet signature #7c5cff + une touche mangue chaude, premium et sobre (true greys, pas de dégradé SaaS générique), paire typo affirmée, un moment typographique fort sur le hero. " +
      "SECTIONS : hero manifeste (l'idée → l'app finie, gardée par la qualité) avec une démo animée du pipeline (idée → l'Élève code → le Gardien juge → app livrée) ; " +
      "« comment ça marche » (kernel, boucle de curation, moteur de goût, Gardien intention+goût+QA) ; « la qualité » (Gardien 7 lentilles, vraies images, teste_parcours + MangoQA) ; " +
      "« preuves » (apps réussies) ; « souveraineté » (cerveau local + Claude en escalade) ; CTA final. Motion au scroll, responsive impeccable. `npm run build` DOIT passer.",
  },
];

async function main(): Promise<void> {
  log("═══ TEST A — pipeline Mango · Élève=qwen2.5-coder:14b (local) · filet Claude OFF ═══");
  const results: Record<string, unknown>[] = [];
  for (const app of APPS) {
    log(`\n───── ${app.name} (template ${app.template}) ─────`);
    const dir = projectDir(app.name);
    try {
      if (!projectExists(app.name)) {
        await createProject(app.name, app.template);
        log(`  ✓ projet scaffoldé`);
      } else {
        log(`  · projet déjà présent — reprise`);
      }
    } catch (e) {
      log(`  ✗ createProject a échoué : ${(e as Error).message}`);
      results.push({ name: app.name, phase: "scaffold", error: (e as Error).message });
      continue;
    }
    const t0 = Date.now();
    try {
      const r = await runRelay(
        app.task,
        dir,
        { provider: "ollama", eleveModel: "qwen2.5-coder:14b", maxEleveAttempts: 3, onLog: (l) => log(`    [relay] ${l}`) },
        eleveOnlyDeps,
      );
      const secs = Math.round((Date.now() - t0) / 1000);
      log(
        `  ▶ RÉSULTAT ${app.name} : success=${r.success} · resolvedBy=${r.resolvedBy} · attempts=${r.attempts} · ` +
          `incomplete=${r.incomplete ?? false} · signal=${r.inspection?.signal} · ${secs}s`,
      );
      if (!r.success) log(`    détail: ${(r.inspection?.detail ?? "").slice(-300)}`);
      results.push({
        name: app.name, success: r.success, resolvedBy: r.resolvedBy, attempts: r.attempts,
        incomplete: r.incomplete ?? false, signal: r.inspection?.signal, secs,
      });
    } catch (e) {
      const secs = Math.round((Date.now() - t0) / 1000);
      log(`  ✗ runRelay a levé : ${(e as Error).message} (${secs}s)`);
      results.push({ name: app.name, phase: "relay", error: (e as Error).message, secs });
    }
    fs.writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2));
  }
  log("\n═══ FIN TEST A ═══");
  log(`résultats: ${RESULTS_FILE}`);
}

main().catch((e) => {
  log(`FATAL: ${(e as Error).stack ?? e}`);
  process.exit(1);
});
