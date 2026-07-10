/* Gate de clôture du site : scroll narratif complet + démo interactive,
   captures desktop 1280x800 + mobile 390px, zéro erreur console. */
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const BASE = "http://localhost:5177";
mkdirSync(".snapshots", { recursive: true });

const errors = [];
const browser = await chromium.launch();

async function run(name, viewport) {
  const page = await browser.newPage({ viewport });
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`[${name}] console: ${m.text()}`);
  });
  page.on("pageerror", (e) => errors.push(`[${name}] pageerror: ${e.message}`));
  page.on("requestfailed", (r) => {
    errors.push(`[${name}] requestfailed: ${r.url()} — ${r.failure()?.errorText}`);
  });

  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `.snapshots/${name}-hero.png` });

  // Démo interactive : cliquer chaque étape du pipeline
  for (let i = 2; i <= 4; i++) {
    await page.click(`.pl-steps li:nth-child(${i}) button`);
    await page.waitForTimeout(900);
  }
  await page.screenshot({ path: `.snapshots/${name}-demo-livree.png` });
  // Étape Gardien (verdicts)
  await page.click(".pl-steps li:nth-child(3) button");
  await page.waitForTimeout(3800);
  await page.screenshot({ path: `.snapshots/${name}-demo-gardien.png` });
  await page.click(".pl-ctl"); // pause

  // Scroll narratif complet et PROGRESSIF (comme un vrai visiteur) :
  // on descend écran par écran pour déclencher chaque révélation.
  const stops = ["#atelier", "#qualite", "#preuves", "#souverainete", "#entrer"];
  let nextStop = 0;
  const total = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < total; y += Math.round(viewport.height * 0.75)) {
    await page.evaluate((yy) => window.scrollTo({ top: yy, behavior: "instant" }), y);
    await page.waitForTimeout(320);
    // capture quand une section-cible vient d'entrer dans le viewport
    if (nextStop < stops.length) {
      const visible = await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (!el) return false;
        const r = el.getBoundingClientRect();
        return r.top < window.innerHeight * 0.55 && r.bottom > 0;
      }, stops[nextStop]);
      if (visible) {
        await page.waitForTimeout(700);
        await page.screenshot({ path: `.snapshots/${name}-${stops[nextStop].slice(1)}.png` });
        nextStop++;
      }
    }
  }

  // Scroll horizontal ? Images cassées ?
  const integ = await page.evaluate(() => {
    const hscroll = document.documentElement.scrollWidth > document.documentElement.clientWidth;
    const broken = [...document.querySelectorAll("img")]
      .filter((i) => i.complete && i.naturalWidth === 0)
      .map((i) => i.src);
    return { hscroll, broken, scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth };
  });
  if (integ.hscroll) errors.push(`[${name}] SCROLL HORIZONTAL: ${integ.scrollW} > ${integ.clientW}`);
  for (const b of integ.broken) errors.push(`[${name}] IMAGE CASSÉE: ${b}`);

  // Pleine page
  await page.locator("#top").scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `.snapshots/${name}-fullpage.png`, fullPage: true });
  await page.close();
}

await run("desktop", { width: 1280, height: 800 });
await run("mobile", { width: 390, height: 844 });

await browser.close();

if (errors.length) {
  console.error("GATE ROUGE:\n" + errors.join("\n"));
  process.exit(1);
}
console.log("GATE VERT — zéro erreur console, zéro scroll horizontal, zéro image cassée.");
