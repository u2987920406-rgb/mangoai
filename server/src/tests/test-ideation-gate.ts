// Lancer : npx tsx src/tests/test-ideation-gate.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { hasIdeation, saveIdeation } from "../ideation.js";

let failures = 0;
const check = (label: string, cond: boolean) => {
  console.log(`  ${cond ? "✓" : "✗"} ${label}`);
  if (!cond) failures++;
};

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ideation-gate-test-"));
}

console.log("─".repeat(60));
console.log("test-ideation-gate");
console.log("─".repeat(60));

const dir1 = tmpDir();
check("hasIdeation false quand absent", !hasIdeation(dir1));

const plan = {
  wireframe: "+---+\n| X |\n+---+",
  palette: ["#111111", "#222222", "#333333", "#444444", "#555555"],
  components: ["Header", "Footer"],
  pages: ["Accueil"],
  summary: "App de test.",
  techStack: ["React", "TypeScript"],
};
saveIdeation(dir1, plan);
check("hasIdeation true après saveIdeation", hasIdeation(dir1));

const saved = JSON.parse(fs.readFileSync(path.join(dir1, ".ideation.json"), "utf8"));
check("plan persisté fidèlement (wireframe)", saved.wireframe === plan.wireframe);
check("plan persisté fidèlement (pages)", JSON.stringify(saved.pages) === JSON.stringify(plan.pages));
check("createdAt horodaté", typeof saved.createdAt === "string" && saved.createdAt.length > 0);

const dir2 = tmpDir();
saveIdeation(dir2, plan);
check("dossier créé automatiquement (mkdir -p)", fs.existsSync(dir2));

console.log("─".repeat(60));
if (failures === 0) {
  console.log("✅ All checks passed.");
} else {
  console.log(`❌ ${failures} failure(s).`);
  process.exitCode = 1;
}

assert.equal(failures, 0);
