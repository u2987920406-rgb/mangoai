// Preuve déterministe de la vérification d'EFFET (ferme le caveat n°7).
// Le cas central : un projet qui COMPILE mais où le changement n'a PAS atterri
// (edit no-op) doit être démasqué — effet ❌ là où le build serait vert.
//
// Lancer :  npx tsx src/test-audit-verify.ts

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { verifyEffect, type EffectSpec } from "../audit-verify.js";

import { line, makeCheck } from "./test-util.js";
let failures = 0;
const check = makeCheck(() => { failures++; });

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "auditverify-"));
const write = (rel: string, content: string) => {
  const abs = path.join(dir, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
};

try {
  line("═");
  console.log("audit-verify — vérification d'effet (anti caveat n°7)");
  line();

  // Un projet où TOUT a bien atterri.
  write("src/utils/slugify.js", "export function slugify(str){ return str.toLowerCase(); }");
  write("src/App.jsx", "export default function App(){ return (<div><header><h1>Bella Napoli</h1></header></div>); }");
  write("src/components/StatCard.css", ".stat{}");

  console.log("\n  [1] Effet présent → ok :");
  check("fonction exportée détectée", verifyEffect(dir, [{ file: "src/utils/slugify.js", includes: ["slugify"], includesAny: ["export"] }]).ok);
  check("texte d'edit atterri (Bella Napoli + <header)", verifyEffect(dir, [{ file: "src/App.jsx", includes: ["Bella Napoli", "<header"] }]).ok);
  check("existence seule suffit (css)", verifyEffect(dir, [{ file: "src/components/StatCard.css", includes: [] }]).ok);

  console.log("\n  [2] LE cas caveat n°7 — build vert mais edit no-op :");
  // App.jsx PRISTINE (sans le header) : un build passerait, mais l'effet est absent.
  write("src/AppPristine.jsx", "export default function App(){ return (<div>Pizzeria</div>); }");
  const noop = verifyEffect(dir, [{ file: "src/AppPristine.jsx", includes: ["Bella Napoli", "<header"] }]);
  check("effet ❌ démasqué (changement absent)", !noop.ok);
  check("le détail nomme ce qui manque", noop.detail.includes("Bella Napoli"));

  console.log("\n  [3] Fichier absent → effet ❌ :");
  const missing = verifyEffect(dir, [{ file: "src/Nope.jsx", includes: ["x"] }]);
  check("fichier absent → ❌", !missing.ok);
  check("détail = 'fichier absent'", missing.detail.includes("fichier absent"));

  console.log("\n  [4] includesAny (tolérance de variante) :");
  check("au moins une variante présente → ok", verifyEffect(dir, [{ file: "src/utils/slugify.js", includesAny: ["export function", "export const", "export default"] }]).ok);
  check("aucune variante → ❌", !verifyEffect(dir, [{ file: "src/utils/slugify.js", includesAny: ["module.exports", "require("] }]).ok);

  console.log("\n  [5] excludes (l'ancien doit avoir disparu) :");
  check("interdit absent → ok", verifyEffect(dir, [{ file: "src/App.jsx", excludes: ["Pizzeria"] }]).ok);
  check("interdit présent → ❌", !verifyEffect(dir, [{ file: "src/AppPristine.jsx", excludes: ["Pizzeria"] }]).ok);

  console.log("\n  [6] multi-fichiers : un seul fichier KO fait échouer l'ensemble :");
  const composite: EffectSpec = [
    { file: "src/utils/slugify.js", includes: ["slugify"] },
    { file: "src/Absent.js", includes: ["x"] },
  ];
  const r = verifyEffect(dir, composite);
  check("ensemble ❌ si un fichier manque", !r.ok);
  check("2 checks rapportés", r.checks.length === 2);

  console.log("\n  [7] sécurité : pas d'évasion hors projet :");
  check("../ → ❌ (hors projet)", !verifyEffect(dir, [{ file: "../secret.txt", includes: ["x"] }]).ok);

  console.log("\n  [8] aucune attente → neutre (honnête) :");
  const none = verifyEffect(dir, []);
  check("ok=true mais détail explicite", none.ok && none.detail.includes("aucune attente"));
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}

line("═");
if (failures === 0) {
  console.log("✅ audit-verify : un build vert sans changement réel est démasqué (caveat n°7 fermé).");
  process.exit(0);
} else {
  console.log(`❌ ${failures} vérification(s) en échec.`);
  process.exit(1);
}
