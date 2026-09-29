// B11 (audit 2026-09-28) — le registre VIVANT doit couvrir tous les roles decla...
// ...ares. Un role declare mais absent des donnees retombe silencieusement sur son
// defaut de code (`{ provider: "none", model: "" }` pour codeur_frontiere), donc un
// role qui EXISTE pour le code et pas pour l'exploitant.
//
// Ce test verrouille l'invariant : tout AgentId declare a une entree dans le registre
// vivant, avec un provider exploitable (pas "none").
//
// Execution : cd server && npx tsx src/tests/test-registre-complet.ts
import fs from "node:fs";

let pass = 0;
let fail = 0;
function check(nom: string, cond: boolean): void {
  if (cond) pass++;
  else { fail++; console.error(`  x ${nom}`); }
}

const registre = JSON.parse(fs.readFileSync("data/brain-registry.json", "utf8")) as Record<
  string,
  { provider?: string; model?: string }
>;
const source = fs.readFileSync("src/brain/brain-registry.ts", "utf8");

// Les AgentId declares (union de type) — extraits de la source, pas d'une copie qui
// pourrait deriver : c'est justement l'ecart source/donnees qu'on veut interdire.
const bloc = source.slice(source.indexOf("export type AgentId ="), source.indexOf("/** Valeurs par défaut"));
const declares = [...bloc.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]!);
check(`des roles sont bien declares dans le code (${declares.length})`, declares.length >= 15);

const absents = declares.filter((r) => !(r in registre));
check(`tout role declare existe dans le registre vivant${absents.length ? ` (manquants : ${absents.join(", ")})` : ""}`, absents.length === 0);

// Un role materialise ne doit pas rester inexploitable : `provider: "none"` signifie
// « ce role ne peut appeler personne » — acceptable comme defaut de CODE, jamais comme
// etat du registre vivant pour un role declare.
const morts = Object.entries(registre)
  .filter(([, c]) => !c || c.provider === "none" || !c.provider)
  .map(([role]) => role);
check(`aucun role du registre vivant n'est inexploitable (${morts.length ? morts.join(", ") : "aucun"})`, morts.length === 0);

// Le role qui a motive B11 : il doit pointer un cerveau REELLEMENT joignable.
const cf = registre["codeur_frontiere"];
check("codeur_frontiere pointe un cerveau exploitable", !!cf && cf.provider !== "none" && !!cf.model);

console.log(`\n${fail === 0 ? "OK" : "ECHEC"} registre complet (B11) : ${pass} pass, ${fail} fail`);
if (fail > 0) process.exit(1);
