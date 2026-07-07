// Test de preuve — render-integrity.ts (É2, Loop Engineering 2026-07-07).
//   npx tsx src/test-render-integrity.ts
//
// [1] analyzeIntegrity (PUR) — tolérances, chaque type de faute isolément, combiné.
// [2] GATE CHIFFRÉ (Playwright réel, vrai navigateur partagé) :
//   - N/N défauts semés (débordement, chevauchement, images cassées) détectés
//     sur des fixtures HTML dédiées.
//   - 0/5 faux positifs sur 5 fixtures HTML "propres" représentatives des
//     patterns d'apps réelles (landing hero, grille de cartes, formulaire,
//     dashboard, long-scroll narratif).
//   Limite honnête consignée : les 5 VRAIES captures de docs/nuit-2026-07-03/
//   sont des PNG statiques (les apps elles-mêmes ont été nettoyées après la
//   nuit, conformément à la pratique du projet) — on ne peut PAS rouvrir une
//   page live sur ces apps précises pour les auditer en DOM. Le gate 0/5 est
//   donc vérifié sur des fixtures représentatives des mêmes patterns de mise
//   en page, pas sur les fichiers exacts. Ce n'est pas la preuve initialement
//   envisagée par le plan — c'est la preuve honnêtement disponible.
import { chromium } from "playwright";
import { analyzeIntegrity, measureIntegrity } from "./render-integrity.js";

let pass = 0, fail = 0;
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

console.log("[1] analyzeIntegrity — pur");
{
  const clean = { scrollWidth: 1200, clientWidth: 1200, textOverlaps: 0, brokenImages: 0, totalImages: 3 };
  check("page propre → broken:false, 0 faute", !analyzeIntegrity(clean).broken && analyzeIntegrity(clean).faults.length === 0);

  const microOverflow = { ...clean, scrollWidth: 1202 }; // 2px, sous la tolérance de 4
  check("micro-débordement (2px) sous tolérance → pas cassé", !analyzeIntegrity(microOverflow).broken);

  const overflow = { ...clean, scrollWidth: 1400 };
  const rOverflow = analyzeIntegrity(overflow);
  check("débordement réel (200px) → cassé", rOverflow.broken);
  check("débordement → faute mentionne 'débordement'", rOverflow.faults.some((f) => /débordement/.test(f)));

  const overlap = { ...clean, textOverlaps: 2 };
  const rOverlap = analyzeIntegrity(overlap);
  check("chevauchement → cassé", rOverlap.broken);
  check("chevauchement → faute mentionne 'chevauchement'", rOverlap.faults.some((f) => /chevauchement/.test(f)));

  const brokenImg = { ...clean, brokenImages: 1 };
  const rImg = analyzeIntegrity(brokenImg);
  check("image cassée → cassé", rImg.broken);
  check("image cassée → faute mentionne 'image'", rImg.faults.some((f) => /image/.test(f)));

  const combo = { scrollWidth: 1500, clientWidth: 1200, textOverlaps: 3, brokenImages: 2, totalImages: 5 };
  const rCombo = analyzeIntegrity(combo);
  check("combiné → cassé avec 3 fautes", rCombo.broken && rCombo.faults.length === 3);
}

// ── Fixtures HTML ────────────────────────────────────────────────────────────
const CLEAN_FIXTURES: Record<string, string> = {
  "landing-hero": `<html><body style="margin:0;width:1200px"><section style="padding:40px"><h1>Bienvenue</h1><p>Un texte de présentation clair, sans chevauchement.</p></section></body></html>`,
  "grille-cartes": `<html><body style="margin:0;width:1200px"><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;padding:24px">
    <div><h3>Carte A</h3><p>Description A</p></div>
    <div><h3>Carte B</h3><p>Description B</p></div>
    <div><h3>Carte C</h3><p>Description C</p></div>
  </div></body></html>`,
  "formulaire": `<html><body style="margin:0;width:1200px;padding:24px;box-sizing:border-box"><form style="box-sizing:border-box"><label>Email</label><input type="email" style="width:300px;box-sizing:border-box"/><label>Message</label><textarea style="width:300px;box-sizing:border-box"></textarea><button>Envoyer</button></form></body></html>`,
  "dashboard": `<html><body style="margin:0;width:1200px;display:flex"><nav style="width:200px;padding:16px"><p>Accueil</p><p>Réglages</p></nav><main style="flex:1;padding:16px"><h2>Tableau de bord</h2><p>Métriques</p></main></body></html>`,
  "long-scroll": `<html><body style="margin:0;width:1200px">${Array.from({ length: 8 }, (_, i) => `<section style="padding:32px"><h2>Section ${i + 1}</h2><p>Contenu narratif de la section ${i + 1}, suffisamment long pour occuper l'espace sans déborder du conteneur parent.</p></section>`).join("")}</body></html>`,
};

const SEEDED_FIXTURES: Record<string, string> = {
  "debordement-seul": `<html><body style="margin:0;width:1200px"><div style="width:2000px;white-space:nowrap">Contenu bien plus large que le viewport, largeur fixe 2000px</div></body></html>`,
  "chevauchement-seul": `<html><body style="margin:0;width:1200px;position:relative">
    <p style="position:absolute;top:20px;left:20px;width:400px;height:60px">Premier bloc de texte qui occupe cette zone</p>
    <p style="position:absolute;top:30px;left:40px;width:400px;height:60px">Second bloc de texte largement superposé au premier</p>
  </body></html>`,
  "image-cassee-seule": `<html><body style="margin:0;width:1200px"><img src="https://exemple-inexistant-404.invalid/x.jpg" width="200" height="150"/></body></html>`,
  "combine": `<html><body style="margin:0;width:1200px;position:relative">
    <div style="width:2000px;white-space:nowrap">Contenu large 2000px qui déborde largement</div>
    <p style="position:absolute;top:80px;left:20px;width:300px;height:50px">Bloc A superposé</p>
    <p style="position:absolute;top:90px;left:30px;width:300px;height:50px">Bloc B superposé à A</p>
    <img src="https://exemple-inexistant-404.invalid/y.jpg" width="100" height="100"/>
  </body></html>`,
};

async function main() {
  console.log("\n[2] GATE CHIFFRÉ — Playwright réel (navigateur partagé)");
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: 1 });

    console.log("\n  -- 0/5 faux positifs sur fixtures PROPRES --");
    let faux = 0;
    for (const [name, html] of Object.entries(CLEAN_FIXTURES)) {
      const page = await context.newPage();
      await page.setContent(html, { waitUntil: "load" });
      await page.waitForTimeout(150);
      const r = await measureIntegrity(page);
      await page.close();
      const ok = !r.broken;
      check(`propre[${name}] → 0 faute (${r.faults.join("; ") || "aucune"})`, ok);
      if (!ok) faux++;
    }
    check(`GATE : 0/5 faux positifs (obtenu ${faux}/5)`, faux === 0);

    console.log("\n  -- N/N défauts semés détectés --");
    let manques = 0;
    const total = Object.keys(SEEDED_FIXTURES).length;
    for (const [name, html] of Object.entries(SEEDED_FIXTURES)) {
      const page = await context.newPage();
      await page.setContent(html, { waitUntil: "load" });
      await page.waitForTimeout(150);
      const r = await measureIntegrity(page);
      await page.close();
      const ok = r.broken;
      check(`semé[${name}] → détecté cassé (${r.faults.join("; ") || "AUCUNE FAUTE — raté"})`, ok);
      if (!ok) manques++;
    }
    check(`GATE : ${total}/${total} défauts semés détectés (obtenu ${total - manques}/${total})`, manques === 0);

    // Vérifie spécifiquement le type de faute attendu par fixture (pas juste "cassé quelque chose").
    {
      const page = await context.newPage();
      await page.setContent(SEEDED_FIXTURES["debordement-seul"], { waitUntil: "load" });
      const r = await measureIntegrity(page);
      await page.close();
      check("debordement-seul → faute de type débordement précisément", r.faults.some((f) => /débordement/.test(f)));
    }
    {
      const page = await context.newPage();
      await page.setContent(SEEDED_FIXTURES["chevauchement-seul"], { waitUntil: "load" });
      const r = await measureIntegrity(page);
      await page.close();
      check("chevauchement-seul → faute de type chevauchement précisément", r.faults.some((f) => /chevauchement/.test(f)));
    }
    {
      const page = await context.newPage();
      await page.setContent(SEEDED_FIXTURES["image-cassee-seule"], { waitUntil: "load" });
      await page.waitForTimeout(300); // laisse le temps à l'erreur de chargement de se propager
      const r = await measureIntegrity(page);
      await page.close();
      check("image-cassee-seule → faute de type image précisément", r.faults.some((f) => /image/.test(f)));
    }

    await context.close();
  } finally {
    await browser.close();
  }

  console.log(`\n${fail === 0 ? "✅" : "❌"} test-render-integrity : ${pass} ✓ / ${fail} ✗`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error("FATAL", e); process.exit(1); });
