// Preuve LIVE du #6 — édition visuelle chirurgicale de bout en bout.
// Simule un clic sur <h1>Bella Napoli</h1> (src/App.jsx:127) puis demande d'en
// changer le texte. Vérifie objectivement que : (a) le build passe, (b) le
// nouveau texte a atterri, (c) le RESTE du fichier est intact (edit chirurgical,
// pas réécriture). Élève SEUL (escalade neutralisée → $0). Copie jonctionnée du
// projet support (ne mute jamais le vrai test-pipeline).
//
// Lancer :  npx tsx src/exp-visual-edit.ts

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { runRelay, defaultRelayDeps } from "./eleve.js";
import { buildVisualEditPrompt } from "./clicksource.js";

const SOURCE = path.resolve(process.cwd(), "..", "workspace", "test-pipeline");
const MARKER = "Pizza Mango Test 42"; // chaîne improbable → preuve que l'edit a pris
const TARGET_TEXT = "Bella Napoli"; // le texte de l'élément cliqué (h1, ligne 127)
const KEEP = "La vera pizza napoletana"; // un voisin qui DOIT rester (anti-réécriture)

let failures = 0;
const check = (label: string, cond: boolean) => {
  console.log(`  ${cond ? "✓" : "✗"} ${label}`);
  if (!cond) failures++;
};

function makeProject(): { dir: string; nmLink: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vedit-"));
  fs.cpSync(SOURCE, dir, {
    recursive: true,
    filter: (s) => !/(^|[\\/])(node_modules|dist|\.git)([\\/]|$)/.test(path.relative(SOURCE, s)),
  });
  const nmLink = path.join(dir, "node_modules");
  fs.symlinkSync(path.join(SOURCE, "node_modules"), nmLink, "junction");
  return { dir, nmLink };
}
function cleanProject(dir: string, nmLink: string): void {
  if (process.platform === "win32") spawnSync("cmd", ["/c", "rmdir", nmLink]);
  else if (fs.existsSync(nmLink)) fs.unlinkSync(nmLink);
  if (!fs.existsSync(nmLink)) fs.rmSync(dir, { recursive: true, force: true });
}

const noEscalate = async () => ({ axiom: false, costUsd: 0, codeChanged: false });

(async () => {
  if (!fs.existsSync(path.join(SOURCE, "node_modules"))) {
    console.error(`✗ Projet support sans node_modules : ${SOURCE}`);
    process.exit(1);
  }
  const { dir, nmLink } = makeProject();
  try {
    const appPath = path.join(dir, "src", "App.jsx");
    const before = fs.readFileSync(appPath, "utf8");
    // On localise dynamiquement la ligne de l'élément cliqué (robuste au décalage).
    const lines = before.split(/\r?\n/);
    const line = lines.findIndex((l) => l.includes(`>${TARGET_TEXT}<`)) + 1;
    check(`élément cible localisé (<h1>${TARGET_TEXT}</h1>)`, line > 0);
    if (line <= 0) throw new Error("cible introuvable");
    console.log(`Clic simulé : src/App.jsx:${line} — « ${TARGET_TEXT} »`);

    const built = buildVisualEditPrompt(
      dir,
      { src: `src/App.jsx:${line}`, tag: "h1", text: TARGET_TEXT },
      `Remplace le texte par "${MARKER}".`,
    );
    check("prompt d'édition visuelle construit", built !== null);
    if (!built) throw new Error("buildVisualEditPrompt null");

    console.log("\n▶ L'Élève (Gemma) exécute l'édition ciblée…");
    const r = await runRelay(
      built.prompt,
      dir,
      { maxEleveAttempts: 2, onLog: (l) => console.log(`   [relay] ${l}`) },
      { ...defaultRelayDeps, escalate: noEscalate },
    );

    const after = fs.existsSync(appPath) ? fs.readFileSync(appPath, "utf8") : "";
    console.log("\n── Vérifications objectives ──");
    check("build vert (compile)", r.success);
    check("fichier cible a CHANGÉ (diff non vide)", after !== before);
    check(`nouveau texte « ${MARKER} » présent`, after.includes(MARKER));
    check(`ancien texte « ${TARGET_TEXT} » remplacé`, !after.includes(`>${TARGET_TEXT}<`));
    check(`reste du fichier intact (« ${KEEP} » conservé)`, after.includes(KEEP));
    // Chirurgical : on n'a pas réécrit tout le fichier (taille du même ordre).
    const ratio = after.length / before.length;
    check("taille comparable (pas de réécriture massive)", ratio > 0.7 && ratio < 1.3);
    console.log(`   résolu par : ${r.resolvedBy} · ${r.attempts} tentative(s) · coût $${r.costUsd.toFixed(4)}`);
  } finally {
    cleanProject(dir, nmLink);
  }

  console.log("═".repeat(60));
  if (failures === 0) {
    console.log("✅ Édition visuelle chirurgicale : clic → edit ciblé → changement vérifié, reste intact.");
    process.exit(0);
  } else {
    console.log(`❌ ${failures} vérification(s) en échec.`);
    process.exit(1);
  }
})();
