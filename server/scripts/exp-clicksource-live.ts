// Banc 2 du #5 — preuve LIVE du tampon Babel data-mango-src de bout en bout.
// Injecte le plugin dans demo-vitrine, relance le dev server, et vérifie qu'un
// clic (elementFromPoint) remonte au fichier:ligne EXACT du source, puis que
// readSourceSnippet lit la bonne ligne. Restaure la config à la fin.
//
// Lancer :  npx tsx src/exp-clicksource-live.ts

import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { startPreview, stopPreview } from "../src/preview.js";
import { ensureClickSourcePlugin, readSourceSnippet, parseSrcRef } from "../src/clicksource.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT = path.resolve(__dirname, "../../workspace/demo-vitrine");
const CFG = path.join(PROJECT, "vite.config.js");

const PROBE = `(() => {
  function pickVisible() {
    var cands = Array.from(document.querySelectorAll("h1,h2,h3,button,a,span,p,li"));
    for (var i = 0; i < cands.length; i++) {
      var c = cands[i], r = c.getBoundingClientRect();
      if (c.children.length === 0 && r.width > 20 && r.height > 10 && r.height < 200 &&
          r.top >= 0 && r.bottom <= 800 && (c.textContent || "").trim()) return c;
    }
    return null;
  }
  var target = pickVisible();
  if (!target) return { error: "aucun élément visible" };
  var r = target.getBoundingClientRect();
  var x = Math.round(r.left + r.width / 2), y = Math.round(r.top + r.height / 2);
  var el = document.elementFromPoint(x, y) || target;
  var stamped = el.closest("[data-mango-src]");
  return {
    tag: el.tagName.toLowerCase(),
    text: (el.textContent || "").slice(0, 40),
    point: { x: x, y: y },
    src: stamped ? stamped.getAttribute("data-mango-src") : null,
    totalStamped: document.querySelectorAll("[data-mango-src]").length
  };
})()`;

let failures = 0;
const check = (label: string, cond: boolean) => {
  console.log(`  ${cond ? "✓" : "✗"} ${label}`);
  if (!cond) failures++;
};

(async () => {
  const backup = fs.readFileSync(CFG, "utf8");
  await stopPreview(); // on repart propre pour que vite relise la config
  try {
    console.log("Injection du tampon data-mango-src dans la config…");
    ensureClickSourcePlugin(PROJECT);
    const injected = fs.readFileSync(CFG, "utf8");
    check("config contient mangoClickSource", injected.includes("mangoClickSource"));
    check("react() remplacé par react({ babel… })", /react\(\{\s*babel/.test(injected));

    const { url } = await startPreview(PROJECT);
    console.log(`Aperçu : ${url}`);
    const browser = await chromium.launch({ channel: "msedge", headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
      await page.goto(url, { waitUntil: "networkidle", timeout: 15_000 });
      await page.waitForTimeout(500);
      const probe = (await page.evaluate(PROBE)) as {
        tag: string; text: string; point: { x: number; y: number };
        src: string | null; totalStamped: number; error?: string;
      };
      console.log("\n── Sonde clic→source (tamponné) ──");
      console.log(JSON.stringify(probe, null, 2));

      check("des éléments sont tamponnés", probe.totalStamped > 0);
      check("le clic remonte un data-mango-src", !!probe.src);
      const ref = probe.src ? parseSrcRef(probe.src) : null;
      check("la référence parse en fichier:ligne", !!ref);
      if (ref) {
        check("pointe un fichier src/ du projet", ref.file.startsWith("src/"));
        const snip = readSourceSnippet(PROJECT, probe.src!);
        if ("error" in snip) {
          check(`readSourceSnippet ok (${snip.error})`, false);
        } else {
          console.log(`\n── Extrait ${snip.file}:${snip.line} ──\n${snip.snippet}`);
          // La ligne pointée doit contenir l'ouverture d'une balise du tag cliqué.
          const targetLine = snip.content.split(/\r?\n/)[snip.line - 1] ?? "";
          check(
            `la ligne ${snip.line} contient <${probe.tag}`,
            targetLine.includes(`<${probe.tag}`),
          );
        }
      }
    } finally {
      await browser.close();
    }
  } finally {
    await stopPreview();
    fs.writeFileSync(CFG, backup); // restauration de la config d'origine
    console.log("\nConfig de demo-vitrine restaurée.");
  }
  console.log("═".repeat(60));
  if (failures === 0) {
    console.log("✅ Tampon data-mango-src : clic → fichier:ligne exact, NATIF, vérifié live.");
    process.exit(0);
  } else {
    console.log(`❌ ${failures} vérification(s) en échec.`);
    process.exit(1);
  }
})();
