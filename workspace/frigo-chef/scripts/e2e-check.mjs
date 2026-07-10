// Parcours e2e : ajouter des ingrédients → voir des suggestions triées → ouvrir une fiche recette.
// Capture desktop 1280x800 + mobile 390px, collecte console/pageerror, exige zéro erreur.
import { chromium } from "playwright";
import path from "node:path";

const BASE_URL = process.env.BASE_URL || "http://localhost:5173";
const OUT_DIR = path.resolve(".snapshots");

async function addIngredients(page) {
  const bank = page.getByTestId("ingredient-bank");
  const categoryTabs = page.locator("div.mb-3.flex.flex-wrap.gap-1\\.5");

  await bank.getByRole("button", { name: /Tomate/ }).click();
  await bank.getByRole("button", { name: /Oignon/ }).click();
  await bank.getByRole("button", { name: /Ail/ }).click();

  await categoryTabs.getByRole("button", { name: /Protéines/ }).click();
  await bank.getByRole("button", { name: /Bœuf haché/ }).click();

  await categoryTabs.getByRole("button", { name: /Épices/ }).click();
  await bank.getByRole("button", { name: /Paprika/ }).click();
  await bank.getByRole("button", { name: /Cumin/ }).click();

  await categoryTabs.getByRole("button", { name: /Légumes/ }).click();
  await bank.getByRole("button", { name: /Salade verte/ }).click();

  await categoryTabs.getByRole("button", { name: /Laitages/ }).click();
  await bank.getByRole("button", { name: /Fromage râpé/ }).click();
}

async function run() {
  const browser = await chromium.launch();
  const errors = [];

  // ── Desktop ──
  const desktopCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const desktopPage = await desktopCtx.newPage();
  desktopPage.on("console", (msg) => {
    if (msg.type() === "error") errors.push(`[desktop console] ${msg.text()}`);
  });
  desktopPage.on("pageerror", (err) => errors.push(`[desktop pageerror] ${err.message}`));

  await desktopPage.goto(BASE_URL, { waitUntil: "networkidle" });
  await desktopPage.waitForTimeout(700); // laisser passer le loading simulé

  // Onboarding vide
  await desktopPage.screenshot({ path: path.join(OUT_DIR, "01-desktop-onboarding.png"), fullPage: true });

  // Ajouter des ingrédients depuis la banque visuelle
  await addIngredients(desktopPage);

  await desktopPage.waitForTimeout(300);
  await desktopPage.screenshot({ path: path.join(OUT_DIR, "02-desktop-inventaire-rempli.png"), fullPage: true });

  // Vérifier qu'au moins une recette cuisinable apparaît (Tacos au bœuf haché épicé attendu)
  const cookableBadge = desktopPage.getByText("Cuisinable maintenant").first();
  await cookableBadge.waitFor({ state: "visible", timeout: 5000 });

  await desktopPage.screenshot({ path: path.join(OUT_DIR, "03-desktop-suggestions.png"), fullPage: true });

  // Ouvrir une fiche recette
  const firstCard = desktopPage.locator("main >> text=Cuisinable maintenant").first();
  await firstCard.click();
  await desktopPage.waitForTimeout(300);
  await desktopPage.getByText("Étapes").waitFor({ state: "visible", timeout: 5000 });
  // fullPage=false : la fiche est en position fixed, un fullPage screenshot la
  // dupliquerait/décalerait pendant le stitching. On capture le viewport visible.
  await desktopPage.screenshot({ path: path.join(OUT_DIR, "04-desktop-fiche-recette.png"), fullPage: false });
  await desktopPage.keyboard.press("Escape").catch(() => {});
  // Fermer la fiche en cliquant en dehors n'est pas géré : on clique le bouton fermer.
  const closeBtn = desktopPage.getByRole("button", { name: "Fermer" });
  if (await closeBtn.isVisible().catch(() => false)) await closeBtn.click();

  // État "aucune recette possible" : filtres cumulés très restrictifs
  // (aucune recette de la base n'est à la fois "rapide < 20 min" et "difficile")
  await desktopPage.getByRole("button", { name: /Rapide < 20 min/ }).click();
  await desktopPage.getByRole("button", { name: /^difficile$/i }).click();
  await desktopPage.waitForTimeout(200);
  await desktopPage
    .getByText("Aucune recette ne colle encore avec tes filtres")
    .waitFor({ state: "visible", timeout: 5000 });
  await desktopPage.screenshot({ path: path.join(OUT_DIR, "08-desktop-aucune-recette.png"), fullPage: true });

  await desktopCtx.close();

  // ── Mobile ──
  const mobileCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mobilePage = await mobileCtx.newPage();
  mobilePage.on("console", (msg) => {
    if (msg.type() === "error") errors.push(`[mobile console] ${msg.text()}`);
  });
  mobilePage.on("pageerror", (err) => errors.push(`[mobile pageerror] ${err.message}`));

  await mobilePage.goto(BASE_URL, { waitUntil: "networkidle" });
  await mobilePage.waitForTimeout(700);
  await mobilePage.screenshot({ path: path.join(OUT_DIR, "05-mobile-onboarding.png"), fullPage: true });

  await addIngredients(mobilePage);

  await mobilePage.waitForTimeout(300);
  await mobilePage.screenshot({ path: path.join(OUT_DIR, "06-mobile-suggestions.png"), fullPage: true });

  const mobileFirstCard = mobilePage.locator("main >> text=Cuisinable maintenant").first();
  await mobileFirstCard.click();
  await mobilePage.waitForTimeout(300);
  await mobilePage.getByText("Étapes").waitFor({ state: "visible", timeout: 5000 });
  await mobilePage.screenshot({ path: path.join(OUT_DIR, "07-mobile-fiche-recette.png"), fullPage: false });

  // render-integrity : pas de scroll horizontal
  const hasHScroll = await mobilePage.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  if (hasHScroll) errors.push("[mobile] scroll horizontal détecté");

  // images cassées ?
  const broken = await mobilePage.evaluate(() =>
    Array.from(document.images)
      .filter((img) => !img.complete || img.naturalWidth === 0)
      .map((img) => img.src),
  );
  if (broken.length) errors.push(`[mobile] images cassées: ${broken.join(", ")}`);

  await mobileCtx.close();
  await browser.close();

  console.log(`\nCaptures écrites dans ${OUT_DIR}`);
  if (errors.length) {
    console.error("\nERREURS DÉTECTÉES :");
    for (const e of errors) console.error(" - " + e);
    process.exit(1);
  }
  console.log("\nZÉRO erreur console/pageerror, zéro image cassée, zéro scroll horizontal.");
}

run().catch((e) => {
  console.error("Échec du script e2e :", e);
  process.exit(1);
});
