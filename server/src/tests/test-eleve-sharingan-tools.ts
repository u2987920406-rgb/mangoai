// Tests de sharingan_url / sharingan_image (Sharingan DIRECT côté Élève, #182 suite,
// 2026-07-11). Déterministe, ZÉRO réseau/Playwright : analyzeUrl/analyzeImage/publishRef
// injectés. On exerce : succès (texte formaté + publication design.reference), erreurs
// (URL invalide, échec d'analyse, chemin vide), et que l'outil ne lève jamais.
import { buildEleveSharinganTools, formatSharinganUrlText, type SharinganDeps } from "../eleve-tools/eleve-sharingan-tools.js";
import type { SharinganResult } from "../vision.js";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); } else { fail++; console.log(`  ✗ ${label}`); }
}

function fakeResult(): SharinganResult {
  return {
    url: "https://exemple-reference.test",
    screenshot: Buffer.from(""),
    screenshotHeight: 900,
    palette: ["#efe9df", "#b8925a", "#1a1a1a"],
    cssVars: {},
    typography: { families: ["Inter"], sizes: [], weights: [] },
    structure: {
      title: "Atelier de référence",
      sections: ["hero", "projets"],
      navItems: ["Accueil", "Projets", "Contact"],
      headings: [{ level: 1, text: "La lumière est le premier matériau" }],
      ctaTexts: ["Voir les projets"],
      landmarks: [],
    },
    fonts: ["Inter", "Georgia"],
    pseudoElements: [],
  };
}

async function run(): Promise<void> {
  // ── formatSharinganUrlText (pure) ───────────────────────────────────────────
  const text = formatSharinganUrlText(fakeResult());
  check("formatSharinganUrlText inclut le titre", text.includes("Atelier de référence"));
  check("formatSharinganUrlText inclut la palette", text.includes("#efe9df"));
  check("formatSharinganUrlText inclut la typo", text.includes("Inter"));
  check("formatSharinganUrlText inclut la navigation", text.includes("Accueil"));

  // ── sharingan_url : succès + publication design.reference ──────────────────
  let published: { project: string; palette: string[]; source: string } | null = null;
  const okDeps: SharinganDeps = {
    analyzeUrl: async () => fakeResult(),
    analyzeImage: async () => ({ palette: [], ambiance: "", samples: 0 }),
    publishRef: (info) => { published = info as typeof published; return true; },
  };
  const tools = buildEleveSharinganTools("/tmp/mon-projet", okDeps);
  const urlTool = tools.find((t) => t.name === "sharingan_url")!;
  check("sharingan_url enregistré", !!urlTool);
  const r1 = await urlTool.handler({ url: "https://exemple-reference.test" });
  check("sharingan_url succès → pas d'erreur", !r1.isError);
  check("sharingan_url renvoie le résumé texte", r1.text.includes("Atelier de référence"));
  check("sharingan_url publie design.reference (source=sharingan)", published !== null && (published as any).source === "sharingan" && (published as any).palette.length === 3);
  check("sharingan_url publie le bon nom de projet (basename)", (published as any).project === "mon-projet");

  // ── sharingan_url : garde-fous ──────────────────────────────────────────────
  const r2 = await urlTool.handler({ url: "not-a-url" });
  check("sharingan_url URL invalide → isError", r2.isError === true);
  const r3 = await urlTool.handler({ url: "localhost:3000" });
  check("sharingan_url sans http(s):// → isError", r3.isError === true);

  const failDeps: SharinganDeps = {
    analyzeUrl: async () => { throw new Error("Playwright timeout"); },
    analyzeImage: async () => ({ palette: [], ambiance: "", samples: 0 }),
    publishRef: () => true,
  };
  const failTools = buildEleveSharinganTools("/tmp/x", failDeps);
  const r4 = await failTools.find((t) => t.name === "sharingan_url")!.handler({ url: "https://ok.test" });
  check("sharingan_url échec d'analyse → isError, ne lève pas", r4.isError === true && r4.text.includes("Playwright timeout"));

  // ── sharingan_image : succès + publication conditionnelle ──────────────────
  let publishedImg: { palette: string[]; source: string } | null = null;
  const imgDeps: SharinganDeps = {
    analyzeUrl: async () => fakeResult(),
    analyzeImage: async () => ({ palette: ["#dcd4e4", "#0c0c0c"], ambiance: "sombre · sourd · froid", samples: 4096 }),
    publishRef: (info) => { publishedImg = info as typeof publishedImg; return true; },
  };
  const imgTools = buildEleveSharinganTools("/tmp/y", imgDeps);
  const imgTool = imgTools.find((t) => t.name === "sharingan_image")!;
  const r5 = await imgTool.handler({ path: ".assets/ref.png" });
  check("sharingan_image succès → pas d'erreur", !r5.isError);
  check("sharingan_image renvoie la palette hex", r5.text.includes("#dcd4e4"));
  check("sharingan_image renvoie l'ambiance", r5.text.includes("sombre · sourd · froid"));
  check("sharingan_image publie design.reference si palette non vide", publishedImg !== null);

  const r6 = await imgTool.handler({ path: "" });
  check("sharingan_image chemin vide → isError", r6.isError === true);

  // Palette vide → PAS de publication (évite de polluer le Bus avec du vide).
  let publishedEmpty = false;
  const emptyDeps: SharinganDeps = {
    analyzeUrl: async () => fakeResult(),
    analyzeImage: async () => ({ palette: [], ambiance: "indéterminée", samples: 0 }),
    publishRef: () => { publishedEmpty = true; return true; },
  };
  const emptyTools = buildEleveSharinganTools("/tmp/z", emptyDeps);
  await emptyTools.find((t) => t.name === "sharingan_image")!.handler({ path: ".assets/vide.png" });
  check("sharingan_image palette vide → AUCUNE publication", !publishedEmpty);

  console.log(`\n${fail === 0 ? "✅" : "❌"} eleve-sharingan-tools : ${pass} pass, ${fail} fail`);
  if (fail > 0) process.exit(1);
}

run().catch((e) => { console.error(e); process.exit(1); });
