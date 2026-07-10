// TEST — Élève = tencent/hy3:free (Hunyuan-3) via OpenRouter (openai-compat), profil
// agentique forcé, filet Claude OFF. Génère 1 app par le pipeline Mango (runRelay).
// Clé lue dans OPENROUTER_KEY (jamais en dur). Lancer :
//   export OPENROUTER_KEY=... ; npx tsx scripts/run-test-hy3.ts
import "dotenv/config";
import { createProject, projectDir, projectExists } from "../src/projects.js";
import { runRelay, defaultRelayDeps } from "../src/eleve.js";
import { glmProfile } from "../src/models/glm.js";

function log(m: string): void { console.log(`[${new Date().toISOString()}] ${m}`); }
const eleveOnlyDeps = { ...defaultRelayDeps, escalate: async () => ({ axiom: false, costUsd: 0, codeChanged: false }) };

const NAME = "galerie-hy3";
const TEMPLATE = "ecommerce";
const TASK =
  "Crée une galerie d'art en ligne de vente d'objets de luxe en plâtre et laiton (luminaires, mobilier). " +
  "ANGLE : « une maison d'édition d'objets rares — la matière parle, la rareté impose le silence ». " +
  "Palette ancrée matière : albâtre (blanc craie #efe9df), laiton (or chaud DÉSATURÉ #b8925a, < 8% de surface), true grey — " +
  "JAMAIS le cliché noir + doré partout. Typo serif display éditoriale + grotesque discrète. Motion lent premium. " +
  "CONTENU : ~12 pièces nommées et racontées (appliques, lampadaires, suspensions, tables, consoles, miroirs) avec " +
  "fiche produit (matière, dimensions, édition limitée numérotée, prix, récit de fabrication) ; grille filtrable " +
  "(catégorie / matière) ; panier fonctionnel (ajout, quantité, total, tiroir latéral). Vraies images. " +
  "États : chargement, panier vide. `npm run build` DOIT passer.";

async function main(): Promise<void> {
  log("═══ TEST hy3 — Élève=tencent/hy3:free via OpenRouter · profil agentique forcé · filet OFF ═══");
  if (!process.env.OPENROUTER_KEY) { log("✗ OPENROUTER_KEY absent de l'env — abandon."); process.exit(1); }
  const dir = projectDir(NAME);
  if (!projectExists(NAME)) { await createProject(NAME, TEMPLATE); log(`✓ scaffoldé (${TEMPLATE})`); }
  const t0 = Date.now();
  try {
    const r = await runRelay(
      TASK,
      dir,
      {
        provider: "openai",
        eleveModel: "tencent/hy3:free",
        endpoint: { baseUrl: "https://openrouter.ai/api/v1", apiKeyEnv: "OPENROUTER_KEY" },
        profile: glmProfile,
        maxEleveAttempts: 3,
        onLog: (l) => log(`  [relay] ${l}`),
      },
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
