// Tests des outils d'ACTION de l'Élève agentique (eleve-action-tools.ts).
// Déterministe, sans réseau : projet temporaire + invocation DIRECTE du registre
// (registry.invoke), zéro LLM. On exerce write/edit/run/finish + leurs garde-fous
// (confinement de chemin, <find> ambigu/absent, commandes interdites).

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildEleveActionTools, FINISH_TOOL } from "./eleve-action-tools.js";
import { toOpenAITools } from "./kernel-mcp.js";

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

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eleve-action-"));
fs.mkdirSync(path.join(dir, "src"), { recursive: true });
fs.writeFileSync(path.join(dir, "src", "App.jsx"), "export default function App(){\n  return <h1>Bonjour</h1>;\n}\n");

const reg = buildEleveActionTools(dir);

async function run() {
  console.log("\n[1] Registre complet (lecture Phase 1 + action Phase 2)");
  check("8 outils enregistrés", reg.names().length === 8);
  check(
    "write_file/edit_file/run_command/finish présents",
    ["write_file", "edit_file", "run_command", "finish"].every((n) => reg.has(n)),
  );
  check("outils lecture Phase 1 conservés", ["read_file", "list_files", "search_code", "check_build"].every((n) => reg.has(n)));
  check("toOpenAITools → 8 functions valides", toOpenAITools(reg).length === 8 && toOpenAITools(reg).every((t) => t.type === "function"));

  console.log("\n[2] write_file");
  const w = await reg.invoke("write_file", { path: "src/new.js", content: "export const x = 7;\n" });
  check("write_file OK (pas d'erreur)", !w.isError);
  check("fichier réellement écrit sur le disque", fs.readFileSync(path.join(dir, "src", "new.js"), "utf8").includes("x = 7"));
  const wOut = await reg.invoke("write_file", { path: "../escape.js", content: "x" });
  check("write_file hors projet → isError", wOut.isError === true);
  check("aucun fichier créé hors du projet", !fs.existsSync(path.join(dir, "..", "escape.js")));

  console.log("\n[3] edit_file");
  const e1 = await reg.invoke("edit_file", { path: "src/App.jsx", find: "Bonjour", replace: "Salut Mango" });
  check("edit_file OK", !e1.isError);
  check("remplacement appliqué sur le disque", fs.readFileSync(path.join(dir, "src", "App.jsx"), "utf8").includes("Salut Mango"));
  const e2 = await reg.invoke("edit_file", { path: "src/App.jsx", find: "INTROUVABLE", replace: "x" });
  check("edit_file <find> absent → isError", e2.isError === true);
  // Fichier avec occurrence ambiguë.
  fs.writeFileSync(path.join(dir, "src", "dup.js"), "const a=1;\nconst a=1;\n");
  const e3 = await reg.invoke("edit_file", { path: "src/dup.js", find: "const a=1;", replace: "const a=2;" });
  check("edit_file <find> ambigu → isError", e3.isError === true);

  console.log("\n[4] run_command (garde-fous)");
  const rOk = await reg.invoke("run_command", { command: process.platform === "win32" ? "echo hello" : "echo hello" });
  check("run_command commande inoffensive → OK", !rOk.isError);
  for (const bad of ["rm -rf /", "git push", "npm publish"]) {
    const r = await reg.invoke("run_command", { command: bad });
    check(`run_command interdit refusé : "${bad}"`, r.isError === true);
  }

  console.log("\n[5] finish (sentinelle)");
  const f = await reg.invoke(FINISH_TOOL, { summary: "todo app livrée, build vert" });
  check("finish renvoie le résumé, sans erreur", !f.isError && f.text.includes("todo app"));

  console.log("\n[6] Phase E3 — gating de run_command (cerveau faible)");
  {
    const gated = buildEleveActionTools(dir, { allowRun: false });
    check("run_command ABSENT quand allowRun=false", !gated.has("run_command"));
    check("7 outils (run_command retiré)", gated.names().length === 7);
    check("write/edit/read/check_build/finish conservés", ["write_file", "edit_file", "read_file", "check_build", "finish"].every((n) => gated.has(n)));
    const full = buildEleveActionTools(dir, { allowRun: true });
    check("run_command présent quand allowRun=true (défaut)", full.has("run_command") && reg.has("run_command"));
  }

  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`\n${fail === 0 ? "✅" : "❌"} eleve-action-tools : ${pass} pass, ${fail} fail`);
  if (fail > 0) process.exit(1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
