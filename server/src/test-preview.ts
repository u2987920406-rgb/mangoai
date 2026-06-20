// Tests purs de l'empreinte de config de l'aperçu (#2 — cache Vite périmé au
// changement de framework). configFingerprint ne touche que le filesystem →
// déterministe. Le lifecycle du process Vite (spawn) reste couvert par le run
// réel, comme il l'a toujours été.
// Lancer : npx tsx src/test-preview.ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { configFingerprint } from "./preview.js";

let pass = 0, fail = 0;
function check(label: string, cond: boolean): void {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

function mkProj(viteConfig: string, pkg: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mangoos-prev-"));
  fs.writeFileSync(path.join(dir, "vite.config.js"), viteConfig);
  fs.writeFileSync(path.join(dir, "package.json"), pkg);
  return dir;
}

const SVELTE_CFG = "import { svelte } from '@sveltejs/vite-plugin-svelte'; export default { plugins: [svelte()] }";
const VUE_CFG = "import vue from '@vitejs/plugin-vue'; export default { plugins: [vue()] }";
const SVELTE_PKG = '{"name":"app","dependencies":{"svelte":"^5.0.0"}}';
const VUE_PKG = '{"name":"app","dependencies":{"vue":"^3.4.0"}}';

console.log("═".repeat(56));
console.log("preview — configFingerprint (#2 cache Vite au changement de framework)");
console.log("─".repeat(56));

const tmp: string[] = [];

{
  const a = mkProj(SVELTE_CFG, SVELTE_PKG); tmp.push(a);
  check("même contenu → empreinte stable (idempotente)", configFingerprint(a) === configFingerprint(a));
}

{
  const svelte = mkProj(SVELTE_CFG, SVELTE_PKG); tmp.push(svelte);
  const vue = mkProj(VUE_CFG, VUE_PKG); tmp.push(vue);
  check("framework différent (Svelte vs Vue) → empreinte différente", configFingerprint(svelte) !== configFingerprint(vue));
}

{
  // Régénération IN-PLACE : même dossier, on réécrit la config d'un framework à l'autre.
  const dir = mkProj(SVELTE_CFG, SVELTE_PKG); tmp.push(dir);
  const before = configFingerprint(dir);
  fs.writeFileSync(path.join(dir, "vite.config.js"), VUE_CFG);
  fs.writeFileSync(path.join(dir, "package.json"), VUE_PKG);
  const after = configFingerprint(dir);
  check("changement in-place du framework → empreinte change", before !== after);
}

{
  // Un changement de package.json seul (ex. ajout d'une dépendance) compte aussi.
  const dir = mkProj(SVELTE_CFG, SVELTE_PKG); tmp.push(dir);
  const before = configFingerprint(dir);
  fs.writeFileSync(path.join(dir, "package.json"), '{"name":"app","dependencies":{"svelte":"^5.0.0","chart.js":"^4.0.0"}}');
  check("ajout de dépendance (package.json) → empreinte change", before !== configFingerprint(dir));
}

{
  // Dossier sans aucune config connue → empreinte définie et stable (hash du vide).
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), "mangoos-prev-")); tmp.push(empty);
  check("dossier sans config → empreinte définie (non vide)", typeof configFingerprint(empty) === "string" && configFingerprint(empty).length > 0);
}

for (const d of tmp) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ } }

console.log("═".repeat(56));
if (fail === 0) console.log(`✅ All ${pass}/${pass} checks passed.`);
else { console.log(`❌ ${fail} échec(s) (${pass} ok).`); process.exit(1); }
