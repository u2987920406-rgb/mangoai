// Tests de la couche design (#159 Phase 2). Déterministe, ZÉRO réseau : analyzeUrl
// injecté. On exerce : extraction (palette/typo/tokens/layout), ambiance dérivée de
// la palette (pure), échec → ok:false sans throw, et le formateur.

import { extractSiteDesign, paletteAmbiance, formatSiteDesign, type SiteDesignDeps } from "./site-design.js";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.log(`  ✗ ${label}`);
  }
}

function depsOf(over: Partial<Awaited<ReturnType<SiteDesignDeps["analyzeUrl"]>>> = {}): SiteDesignDeps {
  return {
    analyzeUrl: async () => ({
      palette: over.palette ?? ["#0b1020", "#f59e0b", "#fafafa"],
      cssVars: over.cssVars ?? { "--color-primary": "#0b1020", "--font-body": "Inter", "--unused-x": "12px" },
      typography: over.typography ?? { families: ["Inter", "Georgia"], weights: ["400", "700"] },
      structure: over.structure ?? { title: "Le Jeu", sections: ["Univers", "Mécaniques"], navItems: ["Accueil", "Jouer"], ctaTexts: ["Commencer"] },
    }),
  };
}

async function run() {
  console.log("\n[1] paletteAmbiance (pur)");
  {
    check("palette claire → 'clair'", paletteAmbiance(["#ffffff", "#f5f5f5", "#eeeeee"]).startsWith("clair"));
    check("palette sombre → 'sombre'", paletteAmbiance(["#000000", "#111111", "#0b0b0b"]).startsWith("sombre"));
    check("rouge vif → 'vif' + 'chaud'", /vif/.test(paletteAmbiance(["#ff0000", "#cc0000"])) && /chaud/.test(paletteAmbiance(["#ff0000", "#cc0000"])));
    check("bleu → 'froid'", /froid/.test(paletteAmbiance(["#0000ff", "#1133cc"])));
    check("palette vide → indéterminée", paletteAmbiance([]) === "indéterminée");
    check("hex invalides ignorés", paletteAmbiance(["pas-hex", "#fff"]).length > 0);
  }

  console.log("\n[2] extractSiteDesign — extraction complète");
  {
    const d = await extractSiteDesign("https://jeu.com", depsOf());
    check("ok", d.ok === true);
    check("palette captée", d.palette.includes("#f59e0b"));
    check("typographies captées", d.typographies.includes("Inter"));
    check("graisses captées", d.graisses.includes("700"));
    check("tokens filtrés (color/font gardés, unused écarté)", d.tokens.some(([k]) => k === "--color-primary") && !d.tokens.some(([k]) => k === "--unused-x"));
    check("ambiance dérivée non vide", d.ambiance.length > 0 && d.ambiance !== "indéterminée");
    check("layout titre + sections", d.layout.titre === "Le Jeu" && d.layout.sections.includes("Mécaniques"));
  }

  console.log("\n[3] analyzeUrl qui lève → ok:false, jamais de throw");
  {
    const deps: SiteDesignDeps = {
      analyzeUrl: async () => {
        throw new Error("navigateur HS");
      },
    };
    let threw = false;
    let d;
    try {
      d = await extractSiteDesign("https://x.com", deps);
    } catch {
      threw = true;
    }
    check("ne throw pas", !threw);
    check("ok:false + error", !!d && d.ok === false && /navigateur HS/.test(d.error ?? ""));
  }

  console.log("\n[4] formatSiteDesign (pur)");
  {
    const d = await extractSiteDesign("https://jeu.com", depsOf());
    const f = formatSiteDesign(d);
    check("contient la palette", f.includes("#f59e0b"));
    check("contient les typographies", f.includes("Inter"));
    check("contient l'ambiance", /Ambiance/.test(f));
    check("contient le layout", f.includes("Mécaniques"));
    const empty = formatSiteDesign({ url: "x", ok: false, palette: [], typographies: [], graisses: [], tokens: [], ambiance: "indéterminée", layout: { titre: "", sections: [], nav: [], cta: [] }, error: "boom" });
    check("design vide → bloc 'non capté'", /non capté/.test(empty));
  }

  console.log(`\n${fail === 0 ? "✅" : "❌"} site-design : ${pass} pass, ${fail} fail`);
  if (fail > 0) process.exit(1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
