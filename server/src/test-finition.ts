// Preuve déterministe de la phase « finition » (pôle QA/Contrôleur) — zéro coût
// API. On verrouille : le mode est reconnu, l'agent qa est enregistré, et le
// scénario finition assemble bien le protocole (Feature Freeze + délégation qa)
// tout en EXCLUANT la planification de nouvelles features (plan/moodboard).
//
// Lancer :  npx tsx src/test-finition.ts

import { ALLOWED_MODES, AGENTS_FOR_TEST } from "./agent.js";
import { assembleSystemPrompt } from "./scenario.js";

import { line, makeCheck } from "./test-util.js";
let failures = 0;
const check = makeCheck(() => { failures++; });

line("═");
console.log("finition — mode, agent contrôleur, scénario");
line();

// 1. Le mode est reconnu côté API.
check("ALLOWED_MODES contient 'finition'", (ALLOWED_MODES as readonly string[]).includes("finition"));

// 2. Le sous-agent contrôleur est enregistré (contrôleur-correcteur : peut éditer).
const controleur = AGENTS_FOR_TEST.controleur;
check("agent contrôleur enregistré", !!controleur);
check("contrôleur peut corriger (Read/Write/Edit)", !!controleur && ["Read", "Write", "Edit"].every((t) => controleur.tools.includes(t)));
check("contrôleur sans Bash (pas de serveur)", !!controleur && !controleur.tools.includes("Bash"));

// 3. Le scénario finition assemble le protocole attendu.
const prompt = assembleSystemPrompt({ mode: "finition", model: "sonnet", projectDir: "." });
check("contient le mode Finition", /Finition — hardening/.test(prompt));
check("contient FEATURE FREEZE", /FEATURE FREEZE/.test(prompt));
check("délègue au sous-agent contrôleur", /"controleur" subagent/.test(prompt));
check("délégation contrôleur OBLIGATOIRE", /MUST launch the "controleur" subagent/.test(prompt));
check("inclut le rituel analytique", /native extended thinking/.test(prompt));
check("consigne le backlog en TODO dans .memory.md", /TODO — décisions en attente/.test(prompt) && /\.memory\.md/.test(prompt));

// 4. Feature Freeze : pas de planification de NOUVELLES features (plan/moodboard absents).
check("EXCLUT Mango Plan (pas de nouveau scope)", !/Mango Plan/i.test(prompt) && !/moodboard/i.test(prompt));

// 5. Contraste : le scénario élite, lui, contient bien le plan (garde-fou anti-régression).
const elite = assembleSystemPrompt({ mode: "elite", model: "sonnet", projectDir: "." });
check("élite contient toujours le plan (témoin)", /Mango Plan/i.test(elite) || /moodboard/i.test(elite));

line("═");
console.log(failures === 0 ? "✅ Phase finition prouvée." : `❌ ${failures} échec(s)`);
process.exit(failures === 0 ? 0 : 1);
