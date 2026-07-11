// TEST — Élève = Qwythos-9B (GGUF local via Ollama), profil agentique forcé, filet OFF.
// 100% souverain : ton PC, gratuit, 1M contexte. Génère la galerie par le pipeline Mango.
// Lancer : npx tsx scripts/run-test-qwythos.ts
import "dotenv/config";
import { createProject, projectDir, projectExists } from "../src/projects.js";
import { runRelay, defaultRelayDeps } from "../src/eleve.js";
import { glmProfile } from "../src/models/glm.js";

function log(m: string): void { console.log(`[${new Date().toISOString()}] ${m}`); }
const eleveOnlyDeps = { ...defaultRelayDeps, escalate: async () => ({ axiom: false, costUsd: 0, codeChanged: false }) };

const NAME = "galerie-qwythos-q6";
const MODEL = "hf.co/empero-ai/Qwythos-9B-v2-GGUF:Q6_K";
const TASK =
  "Crée une galerie d'art en ligne de vente d'objets de luxe en plâtre et laiton (luminaires, mobilier). " +
  "ANGLE : « une maison d'édition d'objets rares — la matière parle, la rareté impose le silence ». " +
  "Palette ancrée matière : albâtre (blanc craie #efe9df), laiton (or chaud DÉSATURÉ #b8925a, < 8% de surface), true grey — " +
  "JAMAIS le cliché noir + doré partout. Typo serif display éditoriale + grotesque discrète. Motion lent premium. " +
  "CONTENU : ~12 pièces nommées et racontées (appliques, lampadaires, suspensions, tables, consoles, miroirs) avec " +
  "fiche produit (matière, dimensions, édition limitée numérotée, prix, récit de fabrication) ; grille filtrable " +
  "(catégorie / matière) ; panier fonctionnel (ajout, quantité, total, tiroir latéral, FERMÉ par défaut). " +
  "Soigne AUSSI le header (nav stylée, pas de liens bruts) et le footer. Vraies images. " +
  "États : chargement, panier vide. `npm run build` DOIT passer.";

async function main(): Promise<void> {
  log("═══ TEST Qwythos-9B — Élève LOCAL (Ollama) · profil agentique forcé · filet OFF · 100% souverain ═══");
  const dir = projectDir(NAME);
  if (!projectExists(NAME)) { await createProject(NAME, "ecommerce"); log("✓ scaffoldé (ecommerce)"); }
  const t0 = Date.now();
  try {
    const r = await runRelay(
      TASK,
      dir,
      { provider: "ollama", eleveModel: MODEL, profile: glmProfile, maxEleveAttempts: 4, onLog: (l) => log(`  [relay] ${l}`) },
      eleveOnlyDeps,
    );
    log(`▶ RÉSULTAT : success=${r.success} · resolvedBy=${r.resolvedBy} · attempts=${r.attempts} · incomplete=${r.incomplete ?? false} · signal=${r.inspection?.signal} · ${Math.round((Date.now() - t0) / 1000)}s`);
    if (!r.success) log(`  détail: ${(r.inspection?.detail ?? "").slice(-300)}`);
  } catch (e) {
    log(`✗ runRelay a levé : ${(e as Error).message}`);
  }
  log("═══ FIN ═══");
}
main().catch((e) => { log(`FATAL: ${(e as Error).stack ?? e}`); process.exit(1); });
