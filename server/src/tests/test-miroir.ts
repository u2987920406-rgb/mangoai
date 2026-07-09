// Preuve déterministe de Le Miroir (idée #48) : extraction de la palette pour
// les pastilles UI + load/save/cap de l'artefact .miroir.md. Pur, sans réseau.
//
// Lancer :  npx tsx src/test-miroir.ts

import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { parseMiroirPalette, loadMiroir, saveMiroir, MIROIR_FILE_NAME } from "../miroir.js";

let failures = 0;
const check = (label: string, cond: boolean) => {
  console.log(`  ${cond ? "✓" : "✗"} ${label}`);
  if (!cond) failures++;
};
const line = (c = "─") => console.log(c.repeat(64));

line("═");
console.log("miroir — extraction palette + persistance .miroir.md");
line();

// 1) Extraction des hex + labels depuis la liste Palette
const md = `# Voici ce que j'ai compris de toi

## Palette
- #1A1A2E — base sombre (depuis la photo du lieu)
- #FF6B35 — accent chaud
- #f4f4f4 : fond clair

## Structure
- Accueil`;

const sw = parseMiroirPalette(md);
check("3 pastilles extraites", sw.length === 3);
check("hex normalisés en minuscules", sw[0].hex === "#1a1a2e" && sw[1].hex === "#ff6b35");
check("label nettoyé du séparateur tiret", sw[0].label === "base sombre (depuis la photo du lieu)");
check("label nettoyé du séparateur deux-points", sw[2].label === "fond clair");

// 2) Déduplication d'un même hex
const dup = parseMiroirPalette("- #FFFFFF blanc\n- #ffffff encore blanc\n- #000 noir");
check("hex dupliqué (casse différente) dédupé", dup.length === 2);
check("hex court #000 reconnu", dup.some((s) => s.hex === "#000"));

// 3) Aucune palette → tableau vide (jamais d'erreur)
check("markdown sans hex → []", parseMiroirPalette("## Intention\nune app de notes").length === 0);
check("chaîne vide → []", parseMiroirPalette("").length === 0);

// 4) load/save round-trip + cap
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "miroir-"));
check("loadMiroir d'un dossier vide → ''", loadMiroir(dir) === "");
saveMiroir(dir, "# Miroir\ncontenu");
check("fichier écrit au bon nom", fs.existsSync(path.join(dir, MIROIR_FILE_NAME)));
check("round-trip save→load", loadMiroir(dir) === "# Miroir\ncontenu");

const huge = "x".repeat(5000);
saveMiroir(dir, huge);
const loaded = loadMiroir(dir);
check("contenu surdimensionné tronqué", loaded.length < 5000 && loaded.includes("tronqué"));
fs.rmSync(dir, { recursive: true, force: true });

line("═");
if (failures === 0) {
  console.log("✅ Miroir : palette extraite/dédupée pour l'UI, artefact persistant et capé.");
  process.exit(0);
} else {
  console.log(`❌ ${failures} vérification(s) en échec.`);
  process.exit(1);
}
