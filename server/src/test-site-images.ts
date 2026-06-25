// Tests de la couche images contextuelles (#159 Phase 5). Déterministe, ZÉRO
// réseau : searchImages / isPexelsConfigured / generate injectés. On exerce : la
// dérivation PURE des requêtes (concept+mood, mécaniques, stopwords), les prompts
// de génération, suggestSiteImages (souverain Pexels, non configuré, génération
// gatée), et le formateur. Ne lève jamais.

import {
  imageQueriesFromDossier,
  generationPromptsFromDossier,
  suggestSiteImages,
  formatSiteImages,
  type SiteImagesDeps,
} from "./site-images.js";
import type { SiteDossier } from "./site-dossier.js";

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

function dossier(over: Partial<SiteDossier> = {}): SiteDossier {
  return {
    url: "https://cafe.com",
    pagesVisitees: ["https://cafe.com"],
    concept: "Café de quartier torréfacteur artisanal",
    publicCible: "habitants",
    mecaniques: ["commande en ligne", "carte de fidélité"],
    design: {
      palette: ["#6f4e37", "#d2b48c"],
      typographies: ["Lora"],
      ambiance: "clair · doux · chaud",
      layout: { titre: "", sections: [], nav: [], cta: [] },
    },
    mood: "chaleureux convivial",
    tonEditorial: "convivial",
    infosCles: [],
    sources: ["https://cafe.com"],
    visionOk: true,
    ...over,
  };
}

async function run() {
  console.log("\n[1] imageQueriesFromDossier — dérivation PURE");
  {
    const qs = imageQueriesFromDossier(dossier());
    check("au moins 1 requête", qs.length >= 1);
    check("1ʳᵉ requête = concept + mood, stopwords retirés (pas 'de')", /quartier/.test(qs[0]) && !/\bde\b/.test(qs[0]));
    check("mood injecté dans la 1ʳᵉ", /chaleureux/.test(qs[0]));
    check("une requête par mécanique", qs.some((q) => /commande/.test(q)));
    check("borné à 3", qs.length <= 3);
  }

  console.log("\n[2] imageQueriesFromDossier — dossier pauvre");
  {
    const qs = imageQueriesFromDossier(dossier({ concept: "", mood: "", mecaniques: [] }));
    check("ne lève pas, au moins borné", Array.isArray(qs));
  }

  console.log("\n[3] generationPromptsFromDossier — PUR");
  {
    const ps = generationPromptsFromDossier(dossier());
    check("prompt héros présent", ps.length >= 1 && /Hero image/.test(ps[0]));
    check("palette injectée", /#6f4e37/.test(ps[0]));
    check("concept injecté", /Café de quartier/.test(ps[0]));
  }

  function deps(over: Partial<SiteImagesDeps> = {}): SiteImagesDeps {
    return {
      isPexelsConfigured: over.isPexelsConfigured ?? (() => true),
      searchImages: over.searchImages ?? (async (q) => [{ url: `https://pexels/${encodeURIComponent(q)}.jpg`, alt: "photo" }]),
      generate: over.generate,
    };
  }

  console.log("\n[4] suggestSiteImages — souverain Pexels (configuré)");
  {
    const r = await suggestSiteImages(dossier(), {}, deps());
    check("pexelsConfigured true", r.pexelsConfigured === true);
    check("photos rapportées (1 par requête)", r.photos.length === r.queries.length && r.photos.length >= 1);
    check("chaque photo a une URL + sa requête", r.photos.every((p) => p.url.startsWith("https://pexels/") && !!p.query));
    check("génération désactivée par défaut", r.genEnabled === false && r.genPrompts.length === 0);
  }

  console.log("\n[5] suggestSiteImages — Pexels non configuré → pas de photo, pas de réseau");
  {
    let called = false;
    const r = await suggestSiteImages(
      dossier(),
      {},
      deps({
        isPexelsConfigured: () => false,
        searchImages: async (q) => {
          called = true;
          return [{ url: "x", alt: "" }];
        },
      }),
    );
    check("pas configuré → photos vides", r.photos.length === 0);
    check("searchImages NON appelé (économie réseau)", called === false);
    check("requêtes quand même fournies (pour chercher_image)", r.queries.length >= 1);
  }

  console.log("\n[6] suggestSiteImages — génération gatée + backend branché");
  {
    const r = await suggestSiteImages(
      dossier(),
      { genEnabled: true },
      deps({ generate: async (p) => ({ url: `https://gen/${p.length}.png` }) }),
    );
    check("prompts de génération produits", r.genPrompts.length >= 1);
    check("images générées via le backend", r.generated.length >= 1 && r.generated[0].startsWith("https://gen/"));
  }

  console.log("\n[7] suggestSiteImages — génération gatée SANS backend → prompts seuls");
  {
    const r = await suggestSiteImages(dossier(), { genEnabled: true }, deps());
    check("prompts présents", r.genPrompts.length >= 1);
    check("aucune image générée (pas de backend)", r.generated.length === 0);
  }

  console.log("\n[8] suggestSiteImages — searchImages qui lève → gracieux");
  {
    let threw = false;
    let r;
    try {
      r = await suggestSiteImages(
        dossier(),
        {},
        deps({
          searchImages: async () => {
            throw new Error("pexels HS");
          },
        }),
      );
    } catch {
      threw = true;
    }
    check("ne lève pas", !threw);
    check("photos vides mais objet cohérent", r!.photos.length === 0 && r!.queries.length >= 1);
  }

  console.log("\n[9] formatSiteImages — rendu");
  {
    const withPhotos = formatSiteImages({
      queries: ["café chaleureux"],
      photos: [{ query: "café chaleureux", url: "https://pexels/c.jpg", alt: "cozy cafe with very long description ".repeat(5) }],
      pexelsConfigured: true,
      genEnabled: false,
      genPrompts: [],
      generated: [],
    });
    check("titre du bloc", /## Images contextuelles/.test(withPhotos));
    check("URL listée", withPhotos.includes("https://pexels/c.jpg"));
    check("alt nettoyé/tronqué (…)", /…/.test(withPhotos));

    const notConfigured = formatSiteImages({
      queries: ["café chaleureux"],
      photos: [],
      pexelsConfigured: false,
      genEnabled: false,
      genPrompts: [],
      generated: [],
    });
    check("non configuré → renvoie vers chercher_image", /chercher_image/.test(notConfigured));

    const empty = formatSiteImages({ queries: [], photos: [], pexelsConfigured: true, genEnabled: false, genPrompts: [], generated: [] });
    check("aucune requête → bloc vide", empty === "");
  }

  console.log(`\n${fail === 0 ? "✅" : "❌"} site-images : ${pass} pass, ${fail} fail`);
  if (fail > 0) process.exit(1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
