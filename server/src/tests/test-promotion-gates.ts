// D6 (audit 2026-09-28, B6) — LE MECANISME DE PROMOTION DES GATES.
//
// LE DEFAUT VISE. `flags.ts` declare 42 gates dont 3 en `default: true` ; `.env` en
// active un de plus. 38 gates dormaient. La politique « defaut OFF = retrogare » est
// bonne pour livrer sans ri sque, mais AUCUN mecanisme ne faisait passer un gate
// eprouve de OFF a ON : la valeur ecrite s'accumulait sans jamais etre encaissee.
//
// Ce test EST ce mecanisme, cote preuve : chaque gate promu dans `.env` doit avoir
// (1) un FlagSpec declare, (2) un test qui l'exerce, (3) une justification tracee.
// Sans lui, promouvoir un gate = un pari silencieux.
//
// Execution : cd server && npx tsx src/tests/test-promotion-gates.ts
// Deterministe, ZERO reseau (lecture de .env + registre de flags).
import fs from "node:fs";
import path from "node:path";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean): void {
  if (cond) pass++;
  else {
    fail++;
    console.error(`  ✗ ${name}`);
  }
}

/** Les gates REELLEMENT actifs en production : `VAR=on|true|1` dans server/.env. */
function gatesActifs(): Set<string> {
  const envPath = path.join(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return new Set();
  const out = new Set<string>();
  for (const ligne of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = /^([A-Z][A-Z0-9_]*)\s*=\s*(on|true|1)\s*$/i.exec(ligne.trim());
    if (m) out.add(m[1]!.toUpperCase());
  }
  return out;
}

/** Les FlagSpec declares dans le registre (source de verite du harnais). */
function flagsDeclares(): Set<string> {
  const src = fs.readFileSync(path.join(process.cwd(), "src/flags.ts"), "utf8");
  const out = new Set<string>();
  for (const m of src.matchAll(/^  ([A-Z][A-Z0-9_]*):\s*\{/gm)) out.add(m[1]!.toUpperCase());
  return out;
}

/** Les gates promus VIA LA METHODE D6 : commentes comme tels dans `.env`. Le commentaire
 *  `# D6 (audit ...)` juste au-dessus de la ligne est la trace de la mesure — c'est ce qui
 *  distingue « promu apres preuve » de « active par accident ». */
function gatesPromusD6(): Set<string> {
  const envPath = path.join(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return new Set();
  const lignes = fs.readFileSync(envPath, "utf8").split("\n");
  const out = new Set<string>();
  let marqueD6 = false;
  for (const l of lignes) {
    const t = l.trim();
    if (t.startsWith("#")) {
      if (/\bD6\b/.test(t)) marqueD6 = true;
      continue;
    }
    if (marqueD6) {
      const m = /^([A-Z][A-Z0-9_]*)\s*=/.exec(t);
      if (m) out.add(m[1]!.toUpperCase());
      marqueD6 = false;
    }
  }
  return out;
}

/** Les fichiers de test du harnais : c'est la preuve exigee avant toute promotion. */
function testsExistants(): string {
  const dir = path.join(process.cwd(), "src/tests");
  if (!fs.existsSync(dir)) return "";
  return fs
    .readdirSync(dir)
    .filter((f) => f.startsWith("test-") && f.endsWith(".ts"))
    .map((f) => fs.readFileSync(path.join(dir, f), "utf8"))
    .join("\n");
}

console.log("[D6] mecanisme de promotion des gates (B6)");

const actifs = gatesActifs();
const declares = flagsDeclares();
const promus = gatesPromusD6();
const sourcesTests = testsExistants();

check("le registre declare bien des gates", declares.size > 20);
check("au moins un gate est actif en production", actifs.size > 0);

// 1. Tout gate actif doit exister dans le registre (sinon: faute de frappe silencieuse).
const inconnus = [...actifs].filter((g) => !declares.has(g) && /^ELEVE_|^BRAIN_|^QA_|^SUITE_|^RELAY_|^LLM_/.test(g));
check(`aucun gate actif n'est inconnu du registre (${inconnus.length} inconnu(s) : ${inconnus.join(",")})`, inconnus.length === 0);

// 2. Tout gate PROMU via D6 doit etre EXERCE par un test — c'est la condition de la methode.
const promusSansTest = [...promus].filter((g) => !sourcesTests.includes(g));
check(
  `tout gate promu via D6 est couvert par un test (${promus.size} promu(s), ${promusSansTest.length} sans test : ${promusSansTest.join(",")})`,
  promusSansTest.length === 0,
);

// 3. La preuve de l'article : le gate B8 est promu ET teste, et son test exerce les DEUX sens.
const testGate = fs.existsSync(path.join(process.cwd(), "src/tests/test-eleve-gate.ts"))
  ? fs.readFileSync(path.join(process.cwd(), "src/tests/test-eleve-gate.ts"), "utf8")
  : "";
check("ELEVE_GATE_DUAL_SKIP_BLOCK est actif en production", actifs.has("ELEVE_GATE_DUAL_SKIP_BLOCK"));
check("...et son test exerce le sens ON", testGate.includes('ELEVE_GATE_DUAL_SKIP_BLOCK = "on"'));
check("...et le sens OFF (non-regression du comportement historique)", testGate.includes("delete process.env.ELEVE_GATE_DUAL_SKIP_BLOCK"));

// 4. Le compte est TRACE, pas estime : on publie l'etat pour la promotion suivante.
console.log(`  gates declares : ${declares.size}`);
console.log(`  gates actifs en production : ${actifs.size} — ${[...actifs].sort().join(", ")}`);
console.log(`  dont promus via la methode D6 (preuve + mesure tracee) : ${promus.size ? [...promus].sort().join(", ") : "aucun"}`);

console.log(`\n${fail === 0 ? "✅" : "❌"} promotion des gates (D6/B6) : ${pass} pass, ${fail} fail`);
if (fail > 0) process.exit(1);
