// Preuve déterministe du conseil d'experts (idée #44) : contexte borné, council,
// diagnostic (lecture seule, erreurs avalées), fusion en plan, artefact
// .recovery-plan.md + section prompt. Mock de `ask`, fs en tmpdir, zéro réseau.
//
// Lancer :  npx tsx src/test-orchestrator.ts

import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import {
  gatherProjectContext,
  buildCouncil,
  diagnose,
  synthesizeRecoveryPlan,
  saveRecoveryPlan,
  loadRecoveryPlan,
  clearRecoveryPlan,
  recoveryPromptSection,
  DEFAULT_LENSES,
  RECOVERY_FILE_NAME,
  type CouncilLens,
} from "../orchestrator.js";

let failures = 0;
const check = (label: string, cond: boolean) => {
  console.log(`  ${cond ? "✓" : "✗"} ${label}`);
  if (!cond) failures++;
};
const line = (c = "─") => console.log(c.repeat(64));

line("═");
console.log("orchestrator — conseil d'experts (rattrapage, lecture seule)");
line();

// 1) Contexte borné, lecture seule
const proj = fs.mkdtempSync(path.join(os.tmpdir(), "council-"));
fs.writeFileSync(path.join(proj, "plan.md"), "# Plan\nUne app de réservation.", "utf8");
fs.mkdirSync(path.join(proj, "src"), { recursive: true });
fs.writeFileSync(path.join(proj, "src", "App.jsx"), "export default function App(){return <div>hi</div>}", "utf8");

const ctx = gatherProjectContext(proj);
check("contexte inclut plan.md", ctx.includes("plan.md") && ctx.includes("réservation"));
check("contexte inclut un fichier source", ctx.includes("App.jsx"));
check("contexte d'un dossier inexistant → placeholder", gatherProjectContext(path.join(proj, "nope")) === "(projet vide ou illisible)");

// 2) Council : panel fixe garanti même sans super-agent
const council = buildCouncil("projet-bidon-sans-agent");
check("council ≥ panel par défaut", council.length >= DEFAULT_LENSES.length);
check("council couvre l'angle produit/cadrage", council.some((l) => l.key === "product"));

// 3) Diagnostic en lecture seule — mock ask
const okAsk = { ask: async () => "- **Souci** (gravité haute) — couplage fort — direction : extraire un hook" };
const lens: CouncilLens = DEFAULT_LENSES[0];
const d = await diagnose(lens, "contexte", "ça a dévié", okAsk);
check("diagnostic renvoyé avec le titre de la lentille", d !== null && d.lens === lens.title);
check("diagnostic porte les findings du mock", d !== null && d.findings.includes("couplage"));

// 4) Une lentille qui throw ne tue pas le conseil → null avalé
const boomAsk = { ask: async () => { throw new Error("LLM down"); } };
const dNull = await diagnose(lens, "contexte", "", boomAsk);
check("erreur de lentille avalée → null", dNull === null);

// 5) Fusion des diagnostics (texte) en plan
const fused = await synthesizeRecoveryPlan(
  [{ lens: "Architecte", key: "architecture", findings: "souci A" }, { lens: "UX", key: "ux", findings: "souci B" }],
  "le départ était mauvais",
  { ask: async () => "# Plan de reprise\n1. **Refactor** (haute) — …" },
);
check("plan de reprise produit", fused.includes("Plan de reprise"));
check("fusion vide si ask échoue", (await synthesizeRecoveryPlan([], "", boomAsk)) === "");

// 6) Artefact .recovery-plan.md : save / load / clear + cap
check("loadRecoveryPlan vide → ''", loadRecoveryPlan(proj) === "");
saveRecoveryPlan(proj, "# Plan de reprise\n1. étape");
check("fichier écrit au bon nom", fs.existsSync(path.join(proj, RECOVERY_FILE_NAME)));
check("round-trip save→load", loadRecoveryPlan(proj) === "# Plan de reprise\n1. étape");

// 7) Section prompt : vide sans plan, instruction + contenu avec plan
check("section vide quand pas de plan", recoveryPromptSection(path.join(proj, "nope")) === "");
const section = recoveryPromptSection(proj);
check("section porte l'instruction « seul writer » séquentiel", section.includes("SEUL writer") && section.includes("SÉQUENTIEL"));
check("section porte le contenu du plan", section.includes("étape"));

saveRecoveryPlan(proj, "x".repeat(5000));
check("plan surdimensionné tronqué", loadRecoveryPlan(proj).includes("tronqué"));

clearRecoveryPlan(proj);
check("clear supprime l'artefact", loadRecoveryPlan(proj) === "");

fs.rmSync(proj, { recursive: true, force: true });

line("═");
if (failures === 0) {
  console.log("✅ Conseil d'experts : contexte borné, council garanti, diagnostics avalent les erreurs, fusion + plan + artefact.");
  process.exit(0);
} else {
  console.log(`❌ ${failures} vérification(s) en échec.`);
  process.exit(1);
}
