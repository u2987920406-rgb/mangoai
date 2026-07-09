// Banc 3 du #5 — preuve e2e du RELAIS VIVANT complet : tampon Babel (config) +
// script inspect-relay (index.html) ensemble. Simule le builder qui active le
// mode inspection, clique un élément, et vérifie que l'aperçu poste en retour
// un inspect-pick avec le bon data-mango-src. Restaure config + index.html.
//
// Lancer :  npx tsx src/exp-clicksource-relay.ts

import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { startPreview, stopPreview } from "../src/preview.js";
import { ensureClickSourcePlugin } from "../src/clicksource.js";
import { ensureInspectRelay } from "../src/relay.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT = path.resolve(__dirname, "../../workspace/demo-vitrine");
const CFG = path.join(PROJECT, "vite.config.js");
const HTML = path.join(PROJECT, "index.html");

// Dans une page top-level, window.parent === window : le script poste vers
// lui-même. On écoute donc window pour capter l'inspect-pick, on active le mode,
// puis on clique réellement (page.mouse.click → vrai hit-test elementFromPoint).
const SETUP_LISTENER = `(() => {
  window.__pick = null;
  window.addEventListener("message", function (e) {
    var d = e.data;
    if (d && d.source === "mangoos-preview" && d.type === "inspect-pick") window.__pick = d;
  });
  window.postMessage({ source: "mangoos-builder", type: "inspect-on" }, "*");
  return true;
})()`;

const FIND_LEAF = `(() => {
  var cands = Array.from(document.querySelectorAll("h1,h2,h3,button,a,span,p,li"));
  for (var i = 0; i < cands.length; i++) {
    var c = cands[i], r = c.getBoundingClientRect();
    if (c.children.length === 0 && r.width > 20 && r.height > 10 && r.height < 200 &&
        r.top >= 0 && r.bottom <= 800 && (c.textContent || "").trim()) {
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2),
               tag: c.tagName.toLowerCase(), text: (c.textContent || "").slice(0, 30) };
    }
  }
  return null;
})()`;

let failures = 0;
const check = (label: string, cond: boolean) => {
  console.log(`  ${cond ? "✓" : "✗"} ${label}`);
  if (!cond) failures++;
};

(async () => {
  const cfgBackup = fs.readFileSync(CFG, "utf8");
  const htmlBackup = fs.readFileSync(HTML, "utf8");
  await stopPreview();
  try {
    ensureClickSourcePlugin(PROJECT);
    ensureInspectRelay(PROJECT);
    check("inspect-relay injecté dans index.html", fs.readFileSync(HTML, "utf8").includes('data-mangoos="inspect-relay"'));

    const { url } = await startPreview(PROJECT);
    console.log(`Aperçu : ${url}`);
    const browser = await chromium.launch({ channel: "msedge", headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
      await page.goto(url, { waitUntil: "networkidle", timeout: 15_000 });
      await page.waitForTimeout(500);

      const leaf = (await page.evaluate(FIND_LEAF)) as
        | { x: number; y: number; tag: string; text: string }
        | null;
      check("une feuille cliquable trouvée", !!leaf);
      if (!leaf) throw new Error("aucune feuille");
      console.log(`Cible : <${leaf.tag}> "${leaf.text}" @ (${leaf.x}, ${leaf.y})`);

      await page.evaluate(SETUP_LISTENER); // active le mode inspection
      await page.mouse.click(leaf.x, leaf.y); // vrai clic → hit-test réel
      await page.waitForTimeout(200);

      const pick = (await page.evaluate("window.__pick")) as
        | { src: string | null; tag: string; text: string; rect: { width: number } }
        | null;
      console.log("\n── inspect-pick reçu ──");
      console.log(JSON.stringify(pick, null, 2));

      check("un inspect-pick a été posté", !!pick);
      check("il porte un data-mango-src", !!pick?.src);
      check("src pointe un fichier src/", !!pick?.src && pick.src.startsWith("src/"));
      check("le tag correspond à la cible", pick?.tag === leaf.tag);
      check("un rectangle est joint", !!pick?.rect && pick.rect.width > 0);
    } finally {
      await browser.close();
    }
  } finally {
    await stopPreview();
    fs.writeFileSync(CFG, cfgBackup);
    fs.writeFileSync(HTML, htmlBackup);
    console.log("\nConfig + index.html de demo-vitrine restaurés.");
  }
  console.log("═".repeat(60));
  if (failures === 0) {
    console.log("✅ Relais clic→source e2e : clic sur l'aperçu → fichier:ligne posté au builder.");
    process.exit(0);
  } else {
    console.log(`❌ ${failures} vérification(s) en échec.`);
    process.exit(1);
  }
})();
