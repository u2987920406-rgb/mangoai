// CHANTIER 4b — GARDE-FOU anti-test-invisible.
//
// Mesure : 256 fichiers de test sur disque, 248 déclarés au manifeste. Les 8
// manquants (dont 7 écrits pendant cette séance) n'étaient exécutés dans AUCUN
// tier — le runner filtre `e && wanted.has(e.tier)`, donc une entrée absente =
// un test qui n'existe pas pour la CI. Un test vert qu'on ne lance jamais est
// une preuve imaginaire : c'est exactement le défaut qui rendait la CI menteuse.
//
// Ce test échoue dès qu'un fichier `src/tests/test-*.ts` n'a pas son entrée.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = path.resolve(TESTS_DIR, "../..");
const MANIFEST = path.join(SERVER_DIR, "test-manifest.json");

// Helpers légitimes : ni tests, ni à déclarer (cf. discover() du runner).
const HELPERS = new Set(["test-util", "test-runner"]);

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, d = "") => {
  if (c) { pass++; console.log(`  ✅ ${n}`); }
  else { fail++; console.log(`  ✗ ${n}${d ? " — " + d : ""}`); }
};

const discovered = fs
  .readdirSync(TESTS_DIR)
  .filter((f) => f.startsWith("test-") && f.endsWith(".ts"))
  .map((f) => f.replace(/\.ts$/, ""))
  .filter((n) => !HELPERS.has(n))
  .sort();

const man = JSON.parse(fs.readFileSync(MANIFEST, "utf8")) as {
  entries: Record<string, { tier: string }>;
};

console.log(`\n[1] Couverture du manifeste (${discovered.length} tests sur disque)`);
const nonDeclares = discovered.filter((n) => !man.entries[n]);
ok(
  `tout test est déclaré (${discovered.length - nonDeclares.length}/${discovered.length})`,
  nonDeclares.length === 0,
  `non déclarés → ${nonDeclares.join(", ")}`,
);

console.log("\n[2] Aucune entrée fantôme (déclarée sans fichier)");
const orphelines = Object.keys(man.entries).filter((n) => !discovered.includes(n));
ok(`aucune entrée orpheline`, orphelines.length === 0, `→ ${orphelines.join(", ")}`);

console.log("\n[3] Tout test déclaré porte un tier exécutable");
const TIERS = new Set(["smoke", "offline", "full", "broken"]);
const tiersInvalides = discovered
  .filter((n) => man.entries[n] && !TIERS.has(man.entries[n].tier))
  .map((n) => `${n}:${man.entries[n].tier}`);
ok(`tiers valides`, tiersInvalides.length === 0, `→ ${tiersInvalides.join(", ")}`);

console.log("\n[4] Contre-preuve : la règle détecte bien un oubli");
// On simule un manifeste amputé d'un test RÉEL : le contrôle doit le voir.
const temoin = discovered[0];
const simule = { entries: { ...man.entries } };
delete simule.entries[temoin];
const detecte = discovered.filter((n) => !simule.entries[n]);
ok(`oubli simulé détecté (${temoin})`, detecte.includes(temoin), "le contrôle ne détecte rien");

console.log(`\n${fail === 0 ? "✅" : "✗"} chantier4b (tests declares) : ${pass} pass, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
