// Tests purs de l'empreinte de config de l'aperçu (#2 — cache Vite périmé au
// changement de framework). configFingerprint ne touche que le filesystem →
// déterministe. Le lifecycle du process Vite (spawn) reste couvert par le run
// réel, comme il l'a toujours été.
// Lancer : npx tsx src/test-preview.ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  configFingerprint,
  startPreview,
  stopPreview,
  previewList,
  isPreviewing,
  previewStatus,
  type Launcher,
} from "../preview.js";

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

// ─── Pool d'aperçus simultanés (#138-P2) ─────────────────────────────────────
// Logique pure du pool (reuse / LRU / cap / arrêt sélectif) testée via un lanceur
// INJECTÉ — aucun process Vite réel. MAX_PREVIEWS = 3 (défaut) ici.
console.log("─".repeat(56));
console.log("preview — pool d'aperçus simultanés (#138-P2)");
console.log("─".repeat(56));

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function tracker() {
  const started: string[] = [];
  const stopped: string[] = [];
  const launch: Launcher = async (projectDir, configHash) => {
    started.push(projectDir);
    let alive = true;
    return {
      projectDir,
      url: `http://127.0.0.1:${5174 + started.length}`,
      port: 5174 + started.length,
      configHash,
      isAlive: async () => alive,
      stop: async () => { alive = false; stopped.push(projectDir); },
    };
  };
  return { started, stopped, launch };
}

await (async () => {
  // Reuse : relancer le MÊME projet (config inchangée) ne relance pas Vite.
  {
    await stopPreview();
    const t = tracker();
    const a = mkProj(SVELTE_CFG, SVELTE_PKG); tmp.push(a);
    const r1 = await startPreview(a, { launch: t.launch });
    const r2 = await startPreview(a, { launch: t.launch });
    check("reuse : même projet → lancé une seule fois", t.started.length === 1);
    check("reuse : même URL rendue", r1.url === r2.url);
    check("reuse : pool de taille 1", previewList().length === 1);
  }

  // Simultané : deux projets différents coexistent (le cœur de #138-P2).
  {
    await stopPreview();
    const t = tracker();
    const a = mkProj(SVELTE_CFG, SVELTE_PKG); tmp.push(a);
    await sleep(2);
    const b = mkProj(VUE_CFG, VUE_PKG); tmp.push(b);
    await startPreview(a, { launch: t.launch });
    await sleep(2);
    await startPreview(b, { launch: t.launch });
    check("simultané : 2 aperçus vivants", previewList().length === 2);
    check("simultané : isPreviewing(a) && isPreviewing(b)", isPreviewing(a) && isPreviewing(b));
    check("simultané : aucun arrêt (l'un ne tue plus l'autre)", t.stopped.length === 0);
    check("MRU : previewStatus() = le plus récent (b)", path.resolve(previewStatus().projectDir!) === path.resolve(b));
  }

  // Config changée EN PLACE : on arrête l'ancien serveur et on relance.
  {
    await stopPreview();
    const t = tracker();
    const dir = mkProj(SVELTE_CFG, SVELTE_PKG); tmp.push(dir);
    await startPreview(dir, { launch: t.launch });
    fs.writeFileSync(path.join(dir, "vite.config.js"), VUE_CFG);
    fs.writeFileSync(path.join(dir, "package.json"), VUE_PKG);
    await startPreview(dir, { launch: t.launch });
    check("config in-place changée → relancé (2 lancements)", t.started.length === 2);
    check("config in-place changée → ancien arrêté (1 arrêt)", t.stopped.length === 1);
    check("config in-place changée → toujours 1 seul au pool", previewList().length === 1);
  }

  // Arrêt sélectif : stopPreview(dir) ne touche que cet aperçu.
  {
    await stopPreview();
    const t = tracker();
    const a = mkProj(SVELTE_CFG, SVELTE_PKG); tmp.push(a);
    const b = mkProj(VUE_CFG, VUE_PKG); tmp.push(b);
    await startPreview(a, { launch: t.launch });
    await startPreview(b, { launch: t.launch });
    await stopPreview(a);
    check("arrêt sélectif : a arrêté, b vivant", !isPreviewing(a) && isPreviewing(b));
    await stopPreview();
    check("arrêt global : pool vidé", previewList().length === 0);
  }

  // Cap + LRU : au-delà de MAX_PREVIEWS (3), on évince le moins récemment utilisé.
  {
    await stopPreview();
    const t = tracker();
    const a = mkProj(SVELTE_CFG, SVELTE_PKG); tmp.push(a);
    const b = mkProj(SVELTE_CFG, SVELTE_PKG); tmp.push(b);
    const c = mkProj(SVELTE_CFG, SVELTE_PKG); tmp.push(c);
    const d = mkProj(SVELTE_CFG, SVELTE_PKG); tmp.push(d);
    await startPreview(a, { launch: t.launch }); await sleep(2);
    await startPreview(b, { launch: t.launch }); await sleep(2);
    await startPreview(c, { launch: t.launch }); await sleep(2);
    await startPreview(a, { launch: t.launch }); await sleep(2); // touche a → b devient le LRU
    await startPreview(d, { launch: t.launch });
    check("cap : pool plafonné à MAX_PREVIEWS (3)", previewList().length === 3);
    check("LRU : le moins récent (b) évincé", !isPreviewing(b) && t.stopped.includes(b));
    check("LRU : a (touché), c, d conservés", isPreviewing(a) && isPreviewing(c) && isPreviewing(d));
  }
  await stopPreview();
})();

for (const d of tmp) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ } }

console.log("═".repeat(56));
if (fail === 0) console.log(`✅ All ${pass}/${pass} checks passed.`);
else { console.log(`❌ ${fail} échec(s) (${pass} ok).`); process.exit(1); }
