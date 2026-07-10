// Gate Playwright : parcours grille → fiche → panier → tiroir, captures, zéro erreur console
import { chromium } from "playwright";

const BASE = "http://localhost:5174";
const SNAP = "D:/IA/MangoOS/workspace/galerie-albatre/.snapshots";
const errors = [];

const browser = await chromium.launch();

async function run(name, viewport) {
  const page = await browser.newPage({ viewport });
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`[${name}] console: ${m.text()}`);
  });
  page.on("pageerror", (e) => errors.push(`[${name}] pageerror: ${e.message}`));

  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForTimeout(1600); // voile de chargement

  // — accueil haut
  await page.screenshot({ path: `${SNAP}/${name}-01-hero.png` });

  // — scroll horizontal ? images cassées ?
  const integrity = await page.evaluate(() => {
    const hscroll = document.documentElement.scrollWidth - document.documentElement.clientWidth;
    const broken = [...document.images]
      .filter((i) => i.complete && i.naturalWidth === 0)
      .map((i) => i.getAttribute("src"));
    return { hscroll, broken };
  });
  if (integrity.hscroll > 1) errors.push(`[${name}] scroll horizontal: ${integrity.hscroll}px`);
  if (integrity.broken.length) errors.push(`[${name}] images cassées: ${integrity.broken.join(", ")}`);

  // — matières
  await page.locator("#matieres").scrollIntoViewIfNeeded();
  await page.waitForTimeout(1300);
  await page.screenshot({ path: `${SNAP}/${name}-02-matieres.png` });

  // — collection + filtre
  await page.locator("#collection").scrollIntoViewIfNeeded();
  await page.waitForTimeout(1300);
  await page.screenshot({ path: `${SNAP}/${name}-03-collection.png` });

  await page.getByRole("button", { name: "Lampes à poser" }).click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${SNAP}/${name}-04-filtre.png` });
  const countTxt = await page.locator(".filter-count").textContent();
  if (!countTxt.includes("5")) errors.push(`[${name}] filtre lampes: attendu 5 pièces, lu "${countTxt}"`);
  await page.getByRole("button", { name: "Toutes" }).first().click();
  await page.waitForTimeout(600);

  // — fiche produit (Amphore)
  await page.getByRole("button", { name: "Voir Amphore" }).click();
  await page.waitForTimeout(1600);
  await page.screenshot({ path: `${SNAP}/${name}-05-fiche.png` });

  // — ajout panier
  await page.locator(".add-btn").click();
  await page.waitForTimeout(700);
  const badge = await page.locator(".cart-count").textContent();
  if (badge.trim() !== "1") errors.push(`[${name}] badge panier: attendu 1, lu "${badge}"`);

  // — tiroir panier
  await page.locator(".cart-btn").click();
  await page.waitForTimeout(1100);
  await page.screenshot({ path: `${SNAP}/${name}-06-panier.png` });

  // — quantité +
  await page.locator(".line-qty button").nth(1).click();
  await page.waitForTimeout(400);
  const total = await page.locator(".drawer-total strong").textContent();
  if (!total.replace(/[\s ]/g, "").includes("2900")) errors.push(`[${name}] total: attendu 2 900 €, lu "${total}"`);

  // — panier vide (état)
  await page.locator(".line-qty button").nth(0).click();
  await page.locator(".line-qty button").nth(0).click();
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${SNAP}/${name}-07-panier-vide.png` });

  await page.locator(".drawer-close").click();
  await page.waitForTimeout(800);

  // — retour accueil
  await page.locator(".back-link").click();
  await page.waitForTimeout(1200);

  await page.close();
}

await run("desktop", { width: 1280, height: 800 });
await run("mobile", { width: 390, height: 844 });

await browser.close();

if (errors.length) {
  console.error("GATE FAIL:\n" + errors.join("\n"));
  process.exit(1);
}
console.log("GATE OK — zéro erreur console, parcours complet, captures écrites");
