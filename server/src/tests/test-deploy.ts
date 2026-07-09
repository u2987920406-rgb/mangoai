// Preuve déterministe du déploiement multi-cibles (#10 / idée 18) — la partie
// pure, sans réseau ni CLI (le bout-à-bout live exige un login Vercel/Netlify,
// comme Cloudflare). Couvre :
//   - isDeployTarget : garde du contrat de la route.
//   - DEPLOY_TARGETS : les 3 cibles attendues, dans l'ordre.
//   - extractFirstUrl : extraction robuste de l'URL dans la sortie CLI.
//   - deployProject : rejet propre d'une cible inconnue (dispatch validé).
//
// Lancer :  npx tsx src/test-deploy.ts

import { DEPLOY_TARGETS, isDeployTarget, extractFirstUrl, deployProject } from "../deploy.js";

import { line, makeCheck } from "./test-util.js";
let failures = 0;
const check = makeCheck(() => { failures++; });

line("═");
console.log("deploy — cibles + garde + extraction d'URL");
line();

// 1) DEPLOY_TARGETS
console.log("\n  [1] DEPLOY_TARGETS :");
check("3 cibles", DEPLOY_TARGETS.length === 3);
check("ordre cloudflare, vercel, netlify", DEPLOY_TARGETS.join(",") === "cloudflare,vercel,netlify");

// 2) isDeployTarget
console.log("\n  [2] isDeployTarget :");
check("'cloudflare' valide", isDeployTarget("cloudflare"));
check("'vercel' valide", isDeployTarget("vercel"));
check("'netlify' valide", isDeployTarget("netlify"));
check("'heroku' invalide", !isDeployTarget("heroku"));
check("undefined invalide", !isDeployTarget(undefined));
check("nombre invalide", !isDeployTarget(42));

// 3) extractFirstUrl
console.log("\n  [3] extractFirstUrl :");
check(
  "URL Vercel dans du bruit",
  extractFirstUrl("Inspect: ...\nProduction: https://demo-vitrine.vercel.app [2s]") ===
    "https://demo-vitrine.vercel.app",
);
check(
  "ponctuation finale retirée",
  extractFirstUrl("Déployé sur https://mon-app.netlify.app.") === "https://mon-app.netlify.app",
);
check("http accepté", extractFirstUrl("see http://localhost:3000 ok") === "http://localhost:3000");
check("aucune URL → null", extractFirstUrl("aucune adresse ici") === null);

// 4) deployProject — dispatch
console.log("\n  [4] deployProject (dispatch) :");
let threw = false;
try {
  // @ts-expect-error — on teste volontairement une cible invalide
  await deployProject("/tmp/x", "x", "azure");
} catch (e) {
  threw = e instanceof Error && /inconnue/i.test(e.message);
}
check("cible inconnue → rejet propre", threw);

line("═");
console.log(failures === 0 ? `✅ TOUT VERT (${0} échec)` : `❌ ${failures} échec(s)`);
process.exit(failures === 0 ? 0 : 1);
