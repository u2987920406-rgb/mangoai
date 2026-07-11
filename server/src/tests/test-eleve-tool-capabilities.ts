// Tests du modèle de CAPACITÉS + registre unifié gardé (#182 É1).
//
// LE test non négociable : ÉGALITÉ BYTE-IDENTIQUE. Un snapshot GOLDEN
// (test-eleve-registry.golden.json) a été capturé sur le code AVANT le refactor
// (les anciennes buildEleveActionTools/buildEleveDiscussTools qui construisaient DEUX
// inventaires). On prouve ici que les NOUVELLES fonctions (registre unifié + policy)
// produisent EXACTEMENT les mêmes outils, pour les mêmes entrées et le même environnement
// de gates. C'est le garde-fou qui rend acceptable ce refactor de chemin CHAUD (§4.9) :
// tous les tours Élève passent par l'assemblage d'outils — un refactor raté casserait
// TOUTE génération.
//
// Comparaison : `toOpenAITools(reg)` = forme canonique {name, description, parameters}
// (les handlers sont des closures fraîches à chaque appel — jamais comparables par
// référence ; ce qui compte, l'INVENTAIRE et le CONTRAT de chaque outil, l'est).
//   · Préréglage CONSTRUIRE → égalité EXACTE (mêmes outils, même ORDRE, même schéma).
//   · Préréglage DISCUTER → l'ordre d'insertion est NORMALISÉ vers l'ordre canonique du
//     registre unifié (aucun appelant ne dépend de l'ordre : les outils sont adressés par
//     NOM). On prouve donc l'égalité d'ENSEMBLE (mêmes noms) + l'égalité de CONTRAT par
//     outil. « même ordre si l'ordre compte » (mandat) — il ne compte pas ici.

import fs from "node:fs";
import path from "node:path";
import { toOpenAITools, type OpenAITool } from "../kernel/kernel-mcp.js";
import { buildEleveActionTools, buildEleveDiscussTools, buildEleveToolRegistry, applyToolPolicy } from "../eleve-tools/eleve-action-tools.js";
import { policyFromCaps, mutationToolNames, type Capability } from "../eleve-tools/eleve-tool-capabilities.js";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.log(`  ✗ ${label}`);
  }
}

const projectDir = path.join(import.meta.dirname, "..", "..");
const GOLDEN: Record<string, OpenAITool[]> = JSON.parse(
  fs.readFileSync(path.join(import.meta.dirname, "test-eleve-registry.golden.json"), "utf8"),
);

const GATES = ["ELEVE_VISION", "ELEVE_CONTENT", "ELEVE_FLUX", "ELEVE_UNITY", "ELEVE_AUTOTEST", "ELEVE_BRICKS", "ELEVE_VAULT", "ELEVE_PLAN_V2"];
function setEnv(over: Record<string, string> = {}) {
  for (const k of GATES) delete process.env[k];
  for (const [k, v] of Object.entries(over)) process.env[k] = v;
}
const names = (tools: OpenAITool[]) => tools.map((t) => t.function.name);
const exactEqual = (a: OpenAITool[], b: OpenAITool[]) => JSON.stringify(a) === JSON.stringify(b);
const sortByName = (a: OpenAITool[]) => [...a].sort((x, y) => x.function.name.localeCompare(y.function.name));
const setEqual = (a: OpenAITool[], b: OpenAITool[]) => JSON.stringify(sortByName(a)) === JSON.stringify(sortByName(b));

console.log("\n[1] ÉGALITÉ BYTE-IDENTIQUE — préréglage CONSTRUIRE (ordre EXACT) vs golden pré-refactor");
{
  // (2026-07-12) golden RÉGÉNÉRÉ — 3 changements légitimes depuis la capture d'origine :
  // Sharingan direct (sharingan_url/sharingan_image, TOUJOURS actif) + `pattern` glob
  // ajouté au schéma de list_files + ELEVE_VISION passé à défaut ON (vois_ecran/lire_image
  // désormais dans construire_default, plus seulement construire_vision).
  setEnv({});
  check("construire_default : 25 outils, égalité EXACTE (ordre + contrat)", exactEqual(toOpenAITools(buildEleveActionTools(projectDir)), GOLDEN.construire_default));
  check("construire_norun (allowRun:false) : 24 outils, égalité EXACTE", exactEqual(toOpenAITools(buildEleveActionTools(projectDir, { allowRun: false })), GOLDEN.construire_norun));
  check("construire_allowlist (sous-agent #175) : égalité EXACTE (finish conservé)", exactEqual(toOpenAITools(buildEleveActionTools(projectDir, { allowedTools: ["read_file", "write_file", "run_command"] })), GOLDEN.construire_allowlist));
  check("construire_denylist (run_command retiré) : égalité EXACTE", exactEqual(toOpenAITools(buildEleveActionTools(projectDir, { deniedTools: ["run_command"] })), GOLDEN.construire_denylist));

  setEnv({ ELEVE_VISION: "on" });
  check("construire_vision (ELEVE_VISION=on explicite) : 25 outils, égalité EXACTE (identique au défaut désormais)", exactEqual(toOpenAITools(buildEleveActionTools(projectDir)), GOLDEN.construire_vision));

  setEnv({ ELEVE_CONTENT: "on", ELEVE_AUTOTEST: "on" });
  check("construire_content_autotest : 29 outils, égalité EXACTE", exactEqual(toOpenAITools(buildEleveActionTools(projectDir)), GOLDEN.construire_content_autotest));
}

console.log("\n[2] ÉGALITÉ BYTE-IDENTIQUE — préréglage DISCUTER (même ENSEMBLE + contrat) vs golden pré-refactor");
{
  setEnv({});
  const d = toOpenAITools(buildEleveDiscussTools(projectDir));
  check("discuter_default : 11 outils", d.length === 11);
  check("discuter_default : même ENSEMBLE d'outils + contrat identique (ordre normalisé)", setEqual(d, GOLDEN.discuter_default));
  const rw = d.find((t) => t.function.name === "requete_web");
  const props = (rw?.function.parameters as { properties?: Record<string, unknown> })?.properties ?? {};
  check("discuter : requete_web en GET-only (schéma sans 'corps')", !!rw && !("corps" in props));

  setEnv({ ELEVE_VISION: "on" });
  check("discuter_vision : même ENSEMBLE que le golden (capacité vision/media-gen absente du plafond Discuter par défaut)", setEqual(toOpenAITools(buildEleveDiscussTools(projectDir)), GOLDEN.discuter_vision));
}

console.log("\n[3] PREUVE DU TROU COMBLÉ — vois_ecran devient OFFRABLE en Discuter dès que `vision` ∈ requiredCaps");
{
  setEnv({ ELEVE_VISION: "on" });
  // Registre unifié : la vision EXISTE dans l'inventaire (gate ON).
  const reg = buildEleveToolRegistry(projectDir, { withFinish: false, httpGetOnly: true });
  check("registre unifié contient vois_ecran (capacité présente dans l'inventaire)", reg.has("vois_ecran"));

  // Défaut Discuter (read-local + read-web) → vois_ecran ABSENT (comportement d'hier).
  const defaut = toOpenAITools(buildEleveDiscussTools(projectDir));
  check("Discuter par défaut : vois_ecran ABSENT (comme avant #182)", !names(defaut).includes("vois_ecran"));

  // Même posture read-only, MAIS requiredCaps inclut `vision` → vois_ecran OFFERT.
  const caps = new Set<Capability>(["read-local", "read-web", "vision"]);
  const filtered = applyPolicyNames(reg, caps);
  check("Discuter + requiredCaps⊇{vision} : vois_ecran DEVENU offrable (le trou de 1.2 comblé)", filtered.includes("vois_ecran"));
  check("… et lire_image aussi (même capacité vision)", filtered.includes("lire_image"));
  // La posture read-only tient : aucun outil mutant même avec la capacité vision.
  check("… sans jamais faire fuir un outil mutant (write_file absent — plafond read-only)", !filtered.includes("write_file"));
}

console.log("\n[4] policyFromCaps — sémantique des deux axes (posture=mutation, intention=capacité)");
{
  // read-only + capacité mutante requise → l'outil mutant reste EXCLU (la posture prime sur l'effet de bord).
  const p1 = policyFromCaps("read-only", new Set<Capability>(["write-fs"]));
  check("read-only : capacité write-fs requise → allowlist VIDE (write_file mutant exclu)", (p1.allowedTools ?? []).length === 0);
  // mutation + write-fs → write_file/edit_file autorisés.
  const p2 = policyFromCaps("mutation", new Set<Capability>(["write-fs"]));
  check("mutation : write-fs → write_file & edit_file autorisés", (p2.allowedTools ?? []).includes("write_file") && (p2.allowedTools ?? []).includes("edit_file"));
  // "all" + mutation → identité (aucun filtre).
  check('policyFromCaps("mutation","all") === {} (identité, préréglage Construire)', JSON.stringify(policyFromCaps("mutation", "all")) === "{}");
  // "all" + read-only → denylist = TOUS les mutants.
  const p3 = policyFromCaps("read-only", "all");
  check('policyFromCaps("read-only","all") interdit tous les mutants (run_command, write_file…)', (p3.deniedTools ?? []).includes("run_command") && (p3.deniedTools ?? []).includes("write_file") && !mutationToolNames().some((n) => !(p3.deniedTools ?? []).includes(n)));
  // read-web read-safe → uniquement des lectures web, jamais de mutant.
  const p4 = policyFromCaps("read-only", new Set<Capability>(["read-web"]));
  check("read-only + read-web → chercher_web/lire_page/extraire_site/requete_web, aucun mutant", ["chercher_web", "lire_page", "extraire_site", "requete_web"].every((n) => (p4.allowedTools ?? []).includes(n)) && !(p4.allowedTools ?? []).some((n) => mutationToolNames().includes(n)));
}

function applyPolicyNames(reg: ReturnType<typeof buildEleveToolRegistry>, caps: Set<Capability>): string[] {
  // Réutilise le VRAI chemin de production : policyFromCaps → applyToolPolicy (#175).
  return applyToolPolicy(reg, policyFromCaps("read-only", caps)).names();
}

setEnv({});
console.log(`\n${fail === 0 ? "✅" : "❌"} eleve-tool-capabilities : ${pass} pass, ${fail} fail`);
if (fail > 0) process.exit(1);
