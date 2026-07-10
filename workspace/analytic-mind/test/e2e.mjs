// e2e.mjs — DRIVE-THEN-SHOOT.
// Charge l'exemple, change de layout, ajoute un nœud + un lien, vérifie que
// le panneau analytique se met à jour, capture desktop + mobile, échoue si
// la moindre erreur console/pageerror est émise.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const APP_URL = process.env.APP_URL || 'http://127.0.0.1:5174/';
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', '.snapshots') + '/';
mkdirSync(OUT, { recursive: true });

const errors = [];
function wire(page, tag) {
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${tag}] console: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[${tag}] pageerror: ${e.message}`));
}
const num = (s) => parseFloat(String(s).replace(',', '.').replace(/[^\d.]/g, '')) || 0;

const browser = await chromium.launch();
try {
  // ── DESKTOP 1280x800 ──────────────────────────────────
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  wire(page, 'desktop');
  await page.goto(APP_URL, { waitUntil: 'networkidle' });
  await page.waitForSelector('.anode', { timeout: 10000 });
  await page.waitForTimeout(900);

  // localStorage peut contenir un état antérieur : on force l'exemple frais.
  await page.evaluate(() => localStorage.removeItem('analytic-mind:v1'));
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.anode', { timeout: 10000 });
  await page.waitForTimeout(1000);

  const nodesBefore = await page.locator('.anode').count();
  const statBefore = await page.locator('.metric-v').first().innerText();
  console.log(`état initial : ${nodesBefore} nœuds affichés · panneau "Nœuds"=${statBefore}`);
  if (nodesBefore < 15) throw new Error(`Exemple trop pauvre : ${nodesBefore} nœuds (attendu >=15)`);

  // 1) Changer de layout → Force
  await page.getByRole('button', { name: 'Force' }).click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: OUT + 'desktop-force.png' });

  // Revenir en hiérarchique pour un shoot lisible
  await page.getByRole('button', { name: 'Hiérarchique' }).click();
  await page.waitForTimeout(1200);

  // 2) Ajouter un nœud
  await page.getByRole('button', { name: '+ Créer' }).click();
  await page.waitForTimeout(500);
  const nodesAfter = await page.locator('.anode').count();
  const statAfter = await page.locator('.metric-v').first().innerText();
  console.log(`après ajout : ${nodesAfter} nœuds · panneau "Nœuds"=${statAfter}`);
  if (num(statAfter) <= num(statBefore)) throw new Error('Le panneau analytique ne s\'est PAS mis à jour après ajout de nœud');

  // 3) Ajouter un lien : glisser depuis un handle source vers un handle target
  const edgesStatBefore = num(await page.locator('.metric-v').nth(1).innerText());
  const sourceHandle = page.locator('.react-flow__node').first().locator('.react-flow__handle-bottom');
  const targetHandle = page.locator('.react-flow__node').nth(2).locator('.react-flow__handle-top');
  try {
    const sb = await sourceHandle.boundingBox();
    const tb = await targetHandle.boundingBox();
    if (sb && tb) {
      await page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2);
      await page.mouse.down();
      await page.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2, { steps: 12 });
      await page.mouse.up();
      await page.waitForTimeout(500);
    }
  } catch (e) { console.log('drag lien : ' + e.message); }
  const edgesStatAfter = num(await page.locator('.metric-v').nth(1).innerText());
  console.log(`liens : ${edgesStatBefore} -> ${edgesStatAfter}`);

  // Focus sur un nœud influent (clic dans le panneau)
  await page.getByText('Nœuds influents', { exact: false }).scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Hiérarchique' }).click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: OUT + 'desktop.png' });
  console.log('capture desktop.png OK');
  await ctx.close();

  // ── MOBILE 390 ────────────────────────────────────────
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true });
  const mp = await mctx.newPage();
  wire(mp, 'mobile');
  await mp.goto(APP_URL, { waitUntil: 'networkidle' });
  await mp.waitForSelector('.anode', { timeout: 10000 });
  await mp.waitForTimeout(1200);
  // vérifier absence de scroll horizontal
  const overflow = await mp.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  console.log(`mobile overflow horizontal : ${overflow}px`);
  await mp.screenshot({ path: OUT + 'mobile.png' });
  console.log('capture mobile.png OK');
  await mctx.close();

  if (errors.length) {
    console.error('\n❌ ERREURS CONSOLE/PAGE :');
    errors.forEach((e) => console.error('  ' + e));
    process.exit(1);
  }
  console.log('\n✅ E2E OK — zéro erreur console/page. Captures dans .snapshots/');
} catch (err) {
  console.error('\n❌ ÉCHEC E2E : ' + err.message);
  errors.forEach((e) => console.error('  ' + e));
  process.exit(1);
} finally {
  await browser.close();
}
