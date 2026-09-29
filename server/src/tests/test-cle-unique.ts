// B19 (audit 2026-09-28) — une seule cle, un seul nom, un seul endroit.
//
// Defaut vise : la MEME valeur servait de `OLLAMA_API_KEY` ET de `ELEVE_API_KEY` dans
// server/.env, et les 15 roles du registre pointaient vers `apiKeyEnv: OLLAMA_API_KEY`
// alors que le code ne resout les cles que via `ELEVE_API_KEY` (eleve/provider.ts,
// llm/llm-endpoint.ts). Consequence : une rotation de cle etait une operation manuelle
// sur plusieurs noms, avec un doublon dont PLUS AUCUN code ne dependait.
//
// CE QUE CE TEST VERROUILLE (il ne lit JAMAIS la valeur d'une cle, seulement les NOMS) :
//   1. le registre n'utilise plus qu'un seul nom de cle ;
//   2. le nom canonique est celui que le code resout reellement ;
//   3. le doublon ne revient pas par accident dans le fichier d'environnement.
//
// Execution : cd server && npx tsx src/tests/test-cle-unique.ts
import fs from "node:fs";

let pass = 0;
let fail = 0;
function check(nom: string, cond: boolean): void {
  if (cond) pass++;
  else { fail++; console.error(`  x ${nom}`); }
}

// [1] Le registre : un seul nom, et c'est le canonique.
{
  const brut = fs.readFileSync("data/brain-registry.json", "utf8");
  const noms = new Set(brut.match(/"apiKeyEnv"\s*:\s*"([A-Z0-9_]+)"/g)?.map((m) => m.split('"')[3]) ?? []);
  check(`le registre n'utilise qu'un seul nom de cle (${[...noms].join(", ")})`, noms.size === 1);
  check("ce nom est le canonique ELEVE_API_KEY", noms.has("ELEVE_API_KEY"));
}

// [2] L'ancien nom ne doit plus apparaitre dans le registre.
{
  const brut = fs.readFileSync("data/brain-registry.json", "utf8");
  check("l'ancien nom OLLAMA_API_KEY a disparu du registre", !brut.includes("OLLAMA_API_KEY"));
}

// [3] Le nom canonique est bien celui que le code resout.
{
  const provider = fs.readFileSync("src/eleve/provider.ts", "utf8");
  check("le code resout bien ELEVE_API_KEY", provider.includes("ELEVE_API_KEY"));
  check("le code ne resout PAS OLLAMA_API_KEY", !provider.includes("OLLAMA_API_KEY"));
}

// [4] Le fichier d'environnement : plus de doublon actif (ligne commentee toleree).
{
  const env = fs.readFileSync(".env", "utf8");
  const actif = (nom: string): boolean =>
    env.split("\n").some((l) => l.startsWith(`${nom}=`) && !l.startsWith("#"));
  check("ELEVE_API_KEY est defini (nom canonique)", actif("ELEVE_API_KEY"));
  check("OLLAMA_API_KEY n'est plus defini comme variable active", !actif("OLLAMA_API_KEY"));
}

console.log(`\n${fail === 0 ? "OK" : "ECHEC"} cle unique (B19) : ${pass} pass, ${fail} fail`);
if (fail > 0) process.exit(1);
