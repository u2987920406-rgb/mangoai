// Tests des outils LECTURE SEULE de l'Élève agentique (eleve-tools.ts).
// Déterministe, sans réseau : on crée un projet temporaire, on exerce chaque
// outil + ses garde-fous (confinement de chemin, cap de lecture, exclusions).
// La boucle askEleveAgentic (function-calling) est vérifiée LIVE contre GLM.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildEleveTools, globToRegExp } from "../eleve-tools/eleve-tools.js";
import { toOpenAITools } from "../kernel/kernel-mcp.js";

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

// ── Projet temporaire ────────────────────────────────────────────────────────
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eleve-tools-"));
fs.mkdirSync(path.join(dir, "src"), { recursive: true });
fs.writeFileSync(path.join(dir, "src", "App.jsx"), "export default function App(){\n  return <h1>Bonjour Mango</h1>;\n}\n");
fs.writeFileSync(path.join(dir, "package.json"), '{"name":"tmp"}\n');
fs.writeFileSync(path.join(dir, "src", "index.css"), "body { margin: 0; }\n");
fs.mkdirSync(path.join(dir, "src", "components"), { recursive: true });
fs.writeFileSync(path.join(dir, "src", "components", "Header.tsx"), "export const Header = () => null;\n");
fs.mkdirSync(path.join(dir, "node_modules", "react"), { recursive: true });
fs.writeFileSync(path.join(dir, "node_modules", "react", "index.js"), "// bruit à ignorer\n");

const reg = buildEleveTools(dir);

async function run() {
  console.log("\n[1] Registre & adaptateur OpenAI");
  check("4 outils enregistrés", reg.names().length === 4);
  check("read_file/list_files/search_code/check_build présents",
    ["read_file", "list_files", "search_code", "check_build"].every((n) => reg.has(n)));
  const oa = toOpenAITools(reg);
  check("toOpenAITools → format function", oa.length === 4 && oa.every((t) => t.type === "function" && !!t.function.name));
  check("read_file a un paramètre `path` requis",
    JSON.stringify((oa.find((t) => t.function.name === "read_file")!.function.parameters as Record<string, unknown>).required ?? []).includes("path"));

  console.log("\n[2] read_file");
  const ok = await reg.invoke("read_file", { path: "src/App.jsx" });
  check("lit le contenu réel", ok.text.includes("Bonjour Mango") && !ok.isError);
  const missing = await reg.invoke("read_file", { path: "src/Nope.jsx" });
  check("fichier absent → isError", missing.isError === true);
  const escape = await reg.invoke("read_file", { path: "../../../../etc/passwd" });
  check("chemin hors projet → REFUSÉ (confinement)", escape.isError === true && /hors du projet/.test(escape.text));
  // troncature
  fs.writeFileSync(path.join(dir, "big.txt"), "x".repeat(30000));
  const big = await reg.invoke("read_file", { path: "big.txt" });
  check("gros fichier tronqué", big.text.includes("tronqué") && big.text.length < 30000);

  console.log("\n[3] list_files");
  const ls = await reg.invoke("list_files", {});
  check("liste src/App.jsx", ls.text.includes("src/App.jsx"));
  check("exclut node_modules", !ls.text.includes("node_modules"));

  console.log("\n[3b] list_files avec pattern (Glob, #182 suite)");
  check("globToRegExp('*.css') matche un fichier plat", globToRegExp("*.css").test("index.css"));
  check("globToRegExp('*.css') NE matche PAS un sous-dossier", !globToRegExp("*.css").test("src/index.css"));
  check("globToRegExp('src/**/*.tsx') matche en profondeur", globToRegExp("src/**/*.tsx").test("src/components/Header.tsx"));
  check("globToRegExp('**/*.tsx') matche à tout niveau", globToRegExp("**/*.tsx").test("src/components/Header.tsx") && globToRegExp("**/*.tsx").test("Header.tsx"));
  const lsTsx = await reg.invoke("list_files", { pattern: "**/*.tsx" });
  check("list_files pattern=**/*.tsx ne renvoie QUE le .tsx", lsTsx.text.includes("Header.tsx") && !lsTsx.text.includes("App.jsx") && !lsTsx.text.includes("index.css"));
  const lsCss = await reg.invoke("list_files", { pattern: "**/*.css" });
  check("list_files pattern=**/*.css cible bien index.css", lsCss.text.includes("index.css") && !lsCss.text.includes(".tsx"));
  const lsNone = await reg.invoke("list_files", { pattern: "**/*.vue" });
  check("list_files pattern sans correspondance → message clair, pas d'erreur", lsNone.text.includes("aucun fichier ne correspond") && !lsNone.isError);
  const lsBad = await reg.invoke("list_files", { pattern: "[" });
  check("list_files motif glob dégénéré → pas de crash", typeof lsBad.text === "string");

  console.log("\n[4] search_code");
  const found = await reg.invoke("search_code", { query: "Bonjour Mango" });
  check("trouve la ligne avec fichier:ligne", /src\/App\.jsx:\d+:/.test(found.text) && found.text.includes("Bonjour Mango"));
  const none = await reg.invoke("search_code", { query: "ZZZ_introuvable_ZZZ" });
  check("aucune correspondance → message clair", none.text.includes("aucune correspondance"));
  const badRe = await reg.invoke("search_code", { query: "[(unclosed" });
  check("regex invalide → repli littéral sans crash", typeof badRe.text === "string" && !badRe.isError);

  console.log("\n[5] invoke garde-fous Kernel");
  let threw = false;
  try { await reg.invoke("read_file", {}); } catch { threw = true; }
  check("args invalides (path manquant) → le registre lève", threw);

  fs.rmSync(dir, { recursive: true, force: true });
  console.log("\n" + "═".repeat(56));
  console.log(fail === 0 ? `✅ Tous les checks verts (${pass}).` : `❌ ${fail} échec(s) sur ${pass + fail}.`);
  if (fail > 0) process.exit(1);
}

run();
