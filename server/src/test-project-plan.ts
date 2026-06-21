// Lancer : npx tsx src/test-project-plan.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  loadPlan,
  savePlan,
  normalizePlan,
  skeletonDone,
  markIncrementDone,
  replaceIncrements,
  projectPlanSection,
  slugify,
  loadFluxCounts,
  type ProjectPlan,
} from "./project-plan.js";

let failures = 0;
const check = (label: string, cond: boolean) => {
  console.log(`  ${cond ? "✓" : "✗"} ${label}`);
  if (!cond) failures++;
};
const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), "pplan-test-"));

console.log("─".repeat(60));
console.log("test-project-plan");
console.log("─".repeat(60));

const basePlan = (): ProjectPlan => ({
  createdAt: 1,
  updatedAt: 1,
  stack: "ts+rrv7",
  skeleton: { status: "done", files: ["src/router.tsx"] },
  increments: [
    { id: "accueil", kind: "page", title: "Accueil", route: "/", status: "todo" },
    { id: "contact", kind: "page", title: "Contact", route: "/contact", status: "todo" },
  ],
});

// 1. Absent par défaut
const d1 = tmpDir();
check("loadPlan null quand absent", loadPlan(d1) === null);
check("skeletonDone false quand absent", !skeletonDone(d1));
check("projectPlanSection '' quand absent", projectPlanSection(d1) === "");
check("loadFluxCounts null quand absent", loadFluxCounts(d1) === null);
fs.rmSync(d1, { recursive: true });

// 2. save/load round-trip
const d2 = tmpDir();
savePlan(d2, basePlan());
const loaded = loadPlan(d2);
check("loadPlan rend le plan sauvé", loaded?.increments.length === 2);
check("skeletonDone true après save (skeleton done)", skeletonDone(d2));
check("updatedAt rafraîchi au save", (loaded?.updatedAt ?? 0) > 1);

// 3. projectPlanSection rend un board lisible
const section = projectPlanSection(d2);
check("section contient le titre du chantier", section.includes("PLAN DU CHANTIER"));
check("section liste les incréments todo", section.includes("[ ] #accueil"));

// 4. markIncrementDone — garde-fou backend
markIncrementDone(d2, "accueil", ["src/pages/Home.tsx"]);
const afterDone = loadPlan(d2);
check("markIncrementDone passe l'incrément à done", afterDone?.increments.find((i) => i.id === "accueil")?.status === "done");
check("markIncrementDone enregistre les fichiers", afterDone?.increments.find((i) => i.id === "accueil")?.files?.[0] === "src/pages/Home.tsx");
check("section coche l'incrément done", projectPlanSection(d2).includes("[x] #accueil"));
markIncrementDone(d2, "inconnu", []); // no-op
check("markIncrementDone id inconnu = no-op", loadPlan(d2)?.increments.length === 2);

// 5. replaceIncrements — édition Kanban (réordre/ajout/dédup)
const replaced = replaceIncrements(d2, [
  { id: "contact", kind: "page", title: "Contact", route: "/contact", status: "doing" },
  { title: "À propos", route: "/about", status: "todo" }, // id dérivé du titre
  { title: "À propos", status: "todo" }, // doublon d'id → ignoré
  { title: "", status: "todo" }, // titre vide → ignoré
]);
check("replaceIncrements remplace la liste", replaced?.increments.length === 2);
check("replaceIncrements dérive un slug du titre", replaced?.increments[1]?.id === "a-propos");
check("replaceIncrements préserve les statuts fournis", replaced?.increments[0]?.status === "doing");
fs.rmSync(d2, { recursive: true });

// 6. normalizePlan défensif (manifest bruité écrit par l'agent)
const noisy = normalizePlan({
  skeleton: { status: "weird" },
  increments: [
    { title: "Ok", status: "bogus", kind: "alien" }, // statut/kind invalides → defaults
    { id: "  ", title: "" }, // vide → rejeté
    "not-an-object",
    { id: "X Y", title: "Page X" }, // id slugifié
  ],
});
check("normalizePlan tolère un statut squelette invalide → todo", noisy?.skeleton.status === "todo");
check("normalizePlan filtre les incréments invalides", noisy?.increments.length === 2);
check("normalizePlan force un statut invalide → todo", noisy?.increments[0]?.status === "todo");
check("normalizePlan force un kind invalide → page", noisy?.increments[0]?.kind === "page");
check("normalizePlan slugifie un id avec espaces", noisy?.increments[1]?.id === "x-y");
check("normalizePlan null sur entrée non-objet", normalizePlan("nope") === null);

// 7. slugify — accents, casse, ponctuation
check("slugify gère accents/casse", slugify("Écran d'Accueil !") === "ecran-d-accueil");
check("slugify trim les tirets", slugify("--Stage 1--") === "stage-1");

// 8. loadFluxCounts lit les observations MangoQA si présentes
const d3 = tmpDir();
fs.mkdirSync(path.join(d3, ".mangoqa"), { recursive: true });
fs.writeFileSync(
  path.join(d3, ".mangoqa", "flux-observations.json"),
  JSON.stringify({ counts: { measured: 2, convergence: 1 } }),
);
const flux = loadFluxCounts(d3);
check("loadFluxCounts lit measured", flux?.fluxMeasured === 2);
check("loadFluxCounts lit convergence", flux?.fluxConvergence === 1);
fs.rmSync(d3, { recursive: true });

console.log("─".repeat(60));
console.log(failures === 0 ? "✓ tous les tests passent" : `✗ ${failures} échec(s)`);
console.log("─".repeat(60));
assert.equal(failures, 0);
