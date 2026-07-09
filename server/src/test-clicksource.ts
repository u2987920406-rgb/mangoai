// Preuve déterministe du relais clic→source (#5) — la partie pure, sans réseau
// ni navigateur (le bout-à-bout live est prouvé par exp-clicksource-live.ts).
//   - parseSrcRef : "src/App.jsx:42" → { file, line }, rejets propres.
//   - readSourceSnippet : extrait numéroté autour de la ligne + contenu intégral,
//     défense en profondeur (pas de sortie du projet).
//   - ensureClickSourcePlugin : injection idempotente, ne touche QUE react().
//
// Lancer :  npx tsx src/test-clicksource.ts

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseSrcRef, readSourceSnippet, ensureClickSourcePlugin, buildVisualEditPrompt } from "./clicksource.js";

import { line, makeCheck } from "./test-util.js";
let failures = 0;
const check = makeCheck(() => { failures++; });

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "clicksrc-"));
try {
  line("═");
  console.log("clicksource — parsing + lecture + injection");
  line();

  // 1) parseSrcRef
  console.log("\n  [1] parseSrcRef :");
  check("'src/App.jsx:42' → file+line", JSON.stringify(parseSrcRef("src/App.jsx:42")) === JSON.stringify({ file: "src/App.jsx", line: 42 }));
  check("backslashes normalisés", parseSrcRef("src\\ui\\Btn.jsx:7")?.file === "src/ui/Btn.jsx");
  check("sans ligne → null", parseSrcRef("src/App.jsx") === null);
  check("ligne 0 → null", parseSrcRef("a.jsx:0") === null);
  check("vide → null", parseSrcRef("") === null);

  // 2) readSourceSnippet sur un fichier réel
  const proj = path.join(dir, "proj");
  fs.mkdirSync(path.join(proj, "src"), { recursive: true });
  const code = ["import React from 'react';", "", "export default function App() {", "  return (", "    <div className=\"x\">", "      <button>Clique</button>", "    </div>", "  );", "}", ""].join("\n");
  fs.writeFileSync(path.join(proj, "src", "App.jsx"), code);

  console.log("\n  [2] readSourceSnippet :");
  const snip = readSourceSnippet(proj, "src/App.jsx:6", 2);
  const ok = !("error" in snip);
  check("lecture réussie", ok);
  if (ok && !("error" in snip)) {
    check("ligne pointée = 6", snip.line === 6);
    check("extrait marque la ligne 6 d'une flèche", /→\s+6 \|/.test(snip.snippet));
    check("extrait contient <button>", snip.snippet.includes("<button>Clique</button>"));
    check("contenu intégral renvoyé", snip.content === code);
    check("contexte borné (±2 → 5 lignes)", snip.snippet.split("\n").length === 5);
  }
  check("fichier absent → error", "error" in readSourceSnippet(proj, "src/Nope.jsx:1"));
  check("évasion ../ → error", "error" in readSourceSnippet(proj, "../secret.txt:1"));

  // 3) ensureClickSourcePlugin — injection idempotente
  console.log("\n  [3] ensureClickSourcePlugin :");
  const cfgPath = path.join(proj, "vite.config.js");
  fs.writeFileSync(cfgPath, ['import { defineConfig } from "vite";', 'import react from "@vitejs/plugin-react";', "", "export default defineConfig({", "  plugins: [react()],", "});", ""].join("\n"));
  ensureClickSourcePlugin(proj);
  const after = fs.readFileSync(cfgPath, "utf8");
  check("fabrique mangoClickSource insérée", after.includes("function mangoClickSource"));
  check("react() → react({ babel… })", /react\(\{\s*babel:/.test(after));
  check("gardé hors production (NODE_ENV)", after.includes('process.env.NODE_ENV === "production"'));
  ensureClickSourcePlugin(proj); // 2e passe
  const after2 = fs.readFileSync(cfgPath, "utf8");
  check("idempotent (inchangé au 2e appel)", after2 === after);
  check("une seule occurrence de la fabrique", (after2.match(/function mangoClickSource/g) ?? []).length === 1);

  // 4) buildVisualEditPrompt (#6) — enrichit la tâche pour un edit chirurgical
  console.log("\n  [4] buildVisualEditPrompt :");
  const built = buildVisualEditPrompt(proj, { src: "src/App.jsx:6", tag: "button", text: "Clique" }, "agrandis le bouton");
  const okBuilt = built !== null;
  check("renvoie un prompt enrichi", okBuilt);
  if (okBuilt) {
    check("cite le fichier:ligne exact", built.prompt.includes("src/App.jsx, ligne 6") && built.file === "src/App.jsx" && built.line === 6);
    check("inclut l'extrait (ligne 6 marquée)", /→\s+6 \|/.test(built.prompt) && built.prompt.includes("<button>Clique</button>"));
    check("impose un edit CHIRURGICAL", /CHIRURGICAL/.test(built.prompt));
    check("reporte la demande utilisateur", built.prompt.includes("agrandis le bouton"));
    check("mentionne l'élément cliqué (button/texte)", built.prompt.includes("button") && built.prompt.includes("Clique"));
  }
  check("cible invalide (fichier absent) → null", buildVisualEditPrompt(proj, { src: "src/Nope.jsx:1" }, "x") === null);
  check("référence malformée → null", buildVisualEditPrompt(proj, { src: "pas-de-ligne" }, "x") === null);

  // 5) config personnalisée (react déjà paramétré) → on ne touche pas
  const proj2 = path.join(dir, "proj2");
  fs.mkdirSync(proj2, { recursive: true });
  const custom = 'import react from "@vitejs/plugin-react";\nexport default { plugins: [react({ jsxRuntime: "classic" })] };\n';
  fs.writeFileSync(path.join(proj2, "vite.config.js"), custom);
  ensureClickSourcePlugin(proj2);
  check("config personnalisée non modifiée", fs.readFileSync(path.join(proj2, "vite.config.js"), "utf8") === custom);
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}

line("═");
if (failures === 0) {
  console.log("✅ clicksource : parsing, lecture bornée et injection idempotente OK.");
  process.exit(0);
} else {
  console.log(`❌ ${failures} vérification(s) en échec.`);
  process.exit(1);
}
