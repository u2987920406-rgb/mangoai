// CHANTIER 4 — la règle structurelle que le JUGE applique est-elle portée par
// le GÉNÉRATEUR ? Un auditeur qui refuse ce que le générateur ignore produit un
// rejet structurel à chaque tour (mesuré : 9/15 rejets MangoQA sur `architecture`).
import { assembleSystemPrompt } from "../scenario.js";
import { MODULARITY_RULES, ARCHITECTURE_RULES } from "../architecture.js";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, d = "") => {
  if (c) { pass++; console.log(`  ✅ ${n}`); }
  else { fail++; console.log(`  ✗ ${n}${d ? " — " + d : ""}`); }
};

// Les critères EXACTS de l'auditeur MangoQA (branches/architecture.ts, specialty).
const CRITERES_JUGE = [
  { nom: "plafond de lignes (monolithe)", motif: "300" },
  { nom: "séparation des responsabilités", motif: "Séparation des responsabilités" },
  { nom: "data-fetching + état + présentation", motif: "data-fetching" },
  { nom: "duplication / code mort", motif: "duplication" },
];

console.log("\n[1] Le générateur énonce les critères du juge");
const bloc = ARCHITECTURE_RULES + MODULARITY_RULES;
for (const c of CRITERES_JUGE) {
  ok(`critère couvert : ${c.nom}`, bloc.includes(c.motif), `motif « ${c.motif} » absent`);
}

console.log("\n[2] La règle atteint le prompt assemblé, dans CHAQUE phase qui construit");
for (const mode of ["elite", "mvp", "projet", "finition"]) {
  const p = assembleSystemPrompt({ mode, model: "eleve", projectDir: "/tmp/inexistant" } as never);
  ok(
    `${mode} : règle structurelle présente`,
    p.includes("Séparation des responsabilités — RÈGLE STRUCTURELLE"),
  );
}

console.log("\n[3] Le cas JEU est nommé explicitement (assets monolithes = rejet n°1)");
ok("découpage des assets cité", bloc.includes("assets/player.js"));
ok("canvas qui monte sans implémenter", bloc.includes("canvas monte la boucle"));
ok("src/game/ découpé par responsabilité", bloc.includes("loop, entities, input"));

console.log("\n[4] Le poids ajouté reste borné (la base est surveillée ~33k)");
const sansRegle = assembleSystemPrompt({ mode: "elite", model: "eleve", projectDir: "/tmp/inexistant" } as never);
const poids = MODULARITY_RULES.length;
ok(`bloc < 2000 chars (réel ${poids})`, poids < 2000);
ok(`base elite < 42000 chars (réel ${sansRegle.length})`, sansRegle.length < 42000);

console.log("\n[5] Contre-preuve : sans le bloc, la règle N'EST PAS dans le prompt");
const p = assembleSystemPrompt({ mode: "elite", model: "eleve", projectDir: "/tmp/inexistant" } as never);
ok("le motif ne vient pas d'un autre bloc",
   p.split("Séparation des responsabilités — RÈGLE STRUCTURELLE").length - 1 === 1,
   "occurrence ≠ 1");

console.log(`\n${fail === 0 ? "✅" : "✗"} chantier4 (regle structurelle) : ${pass} pass, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
