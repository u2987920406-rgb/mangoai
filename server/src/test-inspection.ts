// Tests purs de la détection du backend généré (#35 — gate backend full-stack).
// backendDepsState ne touche QUE le filesystem (aucun build, aucun réseau) →
// déterministe. La validation tsc elle-même (runBackendCheck) est couverte par
// le run réel, comme l'a toujours été inspectProject (vrai vite build).
// Lancer : npx tsx src/test-inspection.ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { backendDepsState } from "./backend-generator.js";

let pass = 0, fail = 0;
function check(label: string, cond: boolean): void {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

function mkProject(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mangoos-insp-"));
  fs.writeFileSync(path.join(dir, "package.json"), '{"name":"front","scripts":{"build":"vite build"}}');
  return dir;
}
function addBackend(dir: string, withDeps: boolean): void {
  const api = path.join(dir, "api");
  fs.mkdirSync(api, { recursive: true });
  fs.writeFileSync(path.join(api, "package.json"), '{"name":"api","scripts":{"dev":"tsx src/index.ts"}}');
  if (withDeps) fs.mkdirSync(path.join(api, "node_modules"), { recursive: true });
}

console.log("═".repeat(56));
console.log("inspection — backendDepsState (#35 backend full-stack)");
console.log("─".repeat(56));

const tmpDirs: string[] = [];

{
  const dir = mkProject(); tmpDirs.push(dir);
  check("projet sans api/ → 'absent'", backendDepsState(dir) === "absent");
}

{
  const dir = mkProject(); tmpDirs.push(dir);
  addBackend(dir, false);
  check("api/ présent sans node_modules → 'no-deps'", backendDepsState(dir) === "no-deps");
}

{
  const dir = mkProject(); tmpDirs.push(dir);
  addBackend(dir, true);
  check("api/ présent avec node_modules → 'ready'", backendDepsState(dir) === "ready");
}

// Nettoyage des fixtures temporaires
for (const d of tmpDirs) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ } }

console.log("═".repeat(56));
if (fail === 0) console.log(`✅ All ${pass}/${pass} checks passed.`);
else { console.log(`❌ ${fail} échec(s) (${pass} ok).`); process.exit(1); }
