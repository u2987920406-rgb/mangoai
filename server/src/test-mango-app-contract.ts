// #138 OS d'apps — Preuve déterministe du contrat MangoApp + du mode compose.
// Manifest load/save/section (sur dir temporaire) + assemblage du scénario 🧩.
//
// Lancer :  npx tsx src/test-mango-app-contract.ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { hasManifest, loadManifest, saveManifest, mangoAppContractSection } from "./mango-app-contract.js";
import { assembleSystemPrompt } from "./scenario.js";
import { ALLOWED_MODES } from "./agent.js";

const line = (c = "─") => console.log(c.repeat(64));
let failures = 0;
const check = (label: string, cond: boolean) => {
  console.log(`  ${cond ? "✓" : "✗"} ${label}`);
  if (!cond) failures++;
};

line("═");
console.log("mango-app-contract — manifest + mode compose");
line();

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mangoapp-"));

// 1. Pas de manifest au départ → section vide, hasManifest false.
check("hasManifest false au départ", hasManifest(dir) === false);
check("loadManifest null au départ", loadManifest(dir) === null);

// 2. Save + reload défensif.
const saved = saveManifest(dir, {
  id: "mango-taches",
  name: "Mango Tâches",
  icon: "📋",
  color: "#f59e0b",
  navEntry: { label: "Tâches", route: "/" },
  collections: [{ name: "tasks", access: "readwrite" }],
});
check("saveManifest tamponne createdAt", typeof saved.createdAt === "string" && saved.createdAt.length > 0);
check("hasManifest true après save", hasManifest(dir) === true);
const loaded = loadManifest(dir);
check("loadManifest relit l'id", loaded?.id === "mango-taches");
check("loadManifest relit la collection", loaded?.collections[0]?.name === "tasks" && loaded?.collections[0]?.access === "readwrite");

// 3. JSON corrompu → null (jamais d'exception).
fs.writeFileSync(path.join(dir, ".mangoapp.json"), "{ not json", "utf8");
check("JSON corrompu → loadManifest null", loadManifest(dir) === null);
// On remet un manifest valide pour la suite.
saveManifest(dir, { id: "mango-taches", name: "Mango Tâches", icon: "📋", color: "#f59e0b", navEntry: { label: "Tâches", route: "/" }, collections: [{ name: "tasks", access: "readwrite" }] });

// 4. Section de prompt.
const section = mangoAppContractSection(dir);
check("section contient le contrat MangoApp", /CONTRAT MANGOAPP/.test(section));
check("section impose .mangoapp.json", /\.mangoapp\.json/.test(section));
check("section rappelle le manifest actuel", /Mango Tâches/.test(section) && /tasks/.test(section));
check("section vide hors contexte (dir vide)", mangoAppContractSection("") === "");

// 5. Mode compose côté API + scénario.
check("ALLOWED_MODES contient 'compose'", (ALLOWED_MODES as readonly string[]).includes("compose"));
const prompt = assembleSystemPrompt({ mode: "compose", model: "sonnet", projectDir: dir });
check("scénario compose : posture App composable", /App composable/.test(prompt));
check("scénario compose : contrat MangoApp injecté", /MangoApp contract/.test(prompt) || /CONTRAT MANGOAPP/.test(prompt));
check("scénario compose : règles données partagées (api/shared)", /\/api\/shared\//.test(prompt));
check("scénario compose : polling court imposé", /SHORT POLLING/.test(prompt));
check("scénario compose : garde l'arsenal Élite (analytic)", /native extended thinking/.test(prompt));
// Garde-fou : le mode compose ne traîne PAS le scaffold/projectPlan du mode
// projet (marqueur distinctif = le manifest de chantier .project-plan.json).
// Témoin : le mode projet, lui, le porte bien.
const projet = assembleSystemPrompt({ mode: "projet", model: "sonnet", projectDir: dir });
check("scénario compose : pas de socle-d'abord (.project-plan.json absent)", !/\.project-plan\.json/.test(prompt));
check("témoin : le mode projet porte bien le socle-d'abord", /\.project-plan\.json/.test(projet));

fs.rmSync(dir, { recursive: true, force: true });
line("═");
console.log(failures === 0 ? "✅ Contrat MangoApp + mode compose prouvés." : `❌ ${failures} échec(s)`);
process.exit(failures === 0 ? 0 : 1);
