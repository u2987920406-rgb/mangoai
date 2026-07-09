// Tests de la persistance des dossiers de site (#159 Phase 4). Blackboard EN
// MÉMOIRE (MemoryStore) → déterministe, zéro I/O. On exerce : dépôt + relecture,
// dédup par URL normalisée (www/slash/protocole), recherche par couleurs (cosinus
// sur la palette), dossier vide non stocké, clé/domaine purs.

import { Blackboard } from "../kernel/kernel-blackboard.js";
import {
  recordSiteDossier,
  listSiteDossiers,
  searchSiteDossiers,
  searchSiteDossiersByText,
  dossierKey,
  SITE_ARTIFACT_SCOPE,
  type SiteDossierArtifact,
} from "../site/site-artifacts.js";
import type { Embed } from "../kernel/kernel-reuse.js";
import type { SiteDossier } from "../site/site-dossier.js";

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
    url: "https://jeu.com",
    objectif: "univers",
    pagesVisitees: ["https://jeu.com"],
    concept: "Jeu d'aventure exploratoire",
    publicCible: "ados",
    mecaniques: ["carte ouverte", "énigmes"],
    design: {
      palette: ["#1f2937", "#f59e0b"],
      typographies: ["Inter"],
      ambiance: "sombre · vif · chaud",
      layout: { titre: "Mon Jeu", sections: ["Univers"], nav: ["Accueil"], cta: ["Jouer"] },
    },
    mood: "héroïque",
    tonEditorial: "épique",
    infosCles: ["sortie 2026"],
    sources: ["https://jeu.com"],
    visionOk: true,
    ...over,
  };
}

// Horloge factice pour des timestamps déterministes.
let clock = 1000;
const tick = () => ++clock;

async function run() {
  console.log("\n[1] dossierKey — normalisation (PUR)");
  {
    check("protocole + www + slash retirés", dossierKey("https://www.Jeu.com/") === "jeu.com");
    check("chemin conservé", dossierKey("http://jeu.com/about") === "jeu.com/about");
  }

  console.log("\n[2] recordSiteDossier + relecture");
  {
    const bb = new Blackboard();
    const ref = recordSiteDossier(dossier(), bb, tick);
    check("ref renvoyée", !!ref && ref.scope === SITE_ARTIFACT_SCOPE);
    const all = listSiteDossiers(bb);
    check("1 dossier listé", all.length === 1);
    const a = all[0].artifact;
    check("type site.dossier", a.type === "site.dossier");
    check("concept persisté", a.concept === "Jeu d'aventure exploratoire");
    check("mécaniques persistées", a.mecaniques.join() === "carte ouverte,énigmes");
    check("palette persistée", a.palette.includes("#f59e0b"));
    check("mood + ton persistés", a.mood === "héroïque" && a.tonEditorial === "épique");
    check("domaine en provenance", a.project === "jeu.com");
  }

  console.log("\n[3] Dédup par URL normalisée");
  {
    const bb = new Blackboard();
    recordSiteDossier(dossier({ url: "https://jeu.com" }), bb, tick);
    recordSiteDossier(dossier({ url: "https://www.jeu.com/", concept: "Version mise à jour" }), bb, tick);
    const all = listSiteDossiers(bb);
    check("toujours 1 dossier (écrasé, pas empilé)", all.length === 1);
    check("contenu = le plus récent", all[0].artifact.concept === "Version mise à jour");
  }

  console.log("\n[4] searchSiteDossiers — par couleurs (cosinus palette)");
  {
    const bb = new Blackboard();
    recordSiteDossier(dossier({ url: "https://chaud.com", design: { ...dossier().design, palette: ["#f59e0b", "#b45309"] } }), bb, tick);
    recordSiteDossier(dossier({ url: "https://froid.com", design: { ...dossier().design, palette: ["#1e3a8a", "#0ea5e9"] } }), bb, tick);
    const hits = searchSiteDossiers(["#f59e0b", "#d97706"], 5, bb);
    check("au moins un résultat", hits.length >= 1);
    check("le plus proche = site chaud", hits[0]?.artifact.url === "https://chaud.com");
    check("score présent", typeof hits[0]?.score === "number");
  }

  console.log("\n[5] Dossier vide (ni concept ni palette) → non stocké");
  {
    const bb = new Blackboard();
    const empty: SiteDossier = {
      url: "https://vide.com",
      pagesVisitees: [],
      concept: "",
      publicCible: "",
      mecaniques: [],
      design: { palette: [], typographies: [], ambiance: "", layout: { titre: "", sections: [], nav: [], cta: [] } },
      mood: "",
      tonEditorial: "",
      infosCles: [],
      sources: [],
      visionOk: false,
    };
    const ref = recordSiteDossier(empty, bb, tick);
    check("ref null", ref === null);
    check("rien listé", listSiteDossiers(bb).length === 0);
  }

  console.log("\n[6] Concept sans palette → stocké (listable) mais non trouvable par couleur");
  {
    const bb = new Blackboard();
    const noPalette = dossier({ url: "https://texte.com", design: { palette: [], typographies: [], ambiance: "", layout: { titre: "", sections: [], nav: [], cta: [] } } });
    recordSiteDossier(noPalette, bb, tick);
    check("listé (concept présent)", listSiteDossiers(bb).length === 1);
    check("pas trouvé par couleur (pas d'embedding)", searchSiteDossiers(["#f59e0b"], 5, bb).length === 0);
  }

  console.log("\n[7] searchSiteDossiersByText — par CONCEPT (L3 Phase B, embedding texte + repli mots-clés)");
  {
    const bb = new Blackboard();
    recordSiteDossier(dossier({ url: "https://jeu.com", concept: "Jeu d'aventure exploratoire", mecaniques: ["carte ouverte", "énigmes"] }), bb, tick);
    recordSiteDossier(
      dossier({ url: "https://shop.com", concept: "Boutique de café en ligne", mecaniques: ["panier", "paiement"], design: { ...dossier().design, palette: ["#6f4e37"] } }),
      bb,
      tick,
    );
    // Embedder de test : [aventure?, café/boutique?] selon le contenu.
    const fakeEmbed: Embed = async (t) => {
      const s = t.toLowerCase();
      return [/(aventure|jeu|énigme|carte)/.test(s) ? 1 : 0, /(café|boutique|panier|paiement)/.test(s) ? 1 : 0];
    };
    const hitsJeu = await searchSiteDossiersByText("un jeu d'aventure", { bb, embed: fakeEmbed, k: 1 });
    check("concept : top-1 sémantique = le jeu", hitsJeu[0]?.artifact.url === "https://jeu.com");
    const hitsShop = await searchSiteDossiersByText("une boutique de café", { bb, embed: fakeEmbed, k: 1 });
    check("concept : top-1 sémantique = la boutique", hitsShop[0]?.artifact.url === "https://shop.com");

    // Repli mots-clés sans embedding (déterministe).
    const fb = await searchSiteDossiersByText("énigmes carte ouverte", { bb, embed: async () => [], k: 1 });
    check("concept : repli mots-clés → le jeu", fb[0]?.artifact.url === "https://jeu.com");
  }

  console.log("\n[8] Le trou L3 fermé : un dossier CONCEPT SANS PALETTE est trouvable par TEXTE");
  {
    const bb = new Blackboard();
    recordSiteDossier(
      dossier({ url: "https://manifeste.com", concept: "manifeste minimaliste typographique", mecaniques: [], design: { palette: [], typographies: ["Times"], ambiance: "", layout: { titre: "", sections: [], nav: [], cta: [] } } }),
      bb,
      tick,
    );
    check("invisible par couleur (rappel #6)", searchSiteDossiers(["#f59e0b"], 5, bb).length === 0);
    const byText = await searchSiteDossiersByText("manifeste minimaliste", { bb, embed: async () => [], k: 1 });
    check("DÉSORMAIS trouvable par concept (repli mots-clés)", byText[0]?.artifact.url === "https://manifeste.com");
    // Bibliothèque vide → [].
    check("bibliothèque vide → []", (await searchSiteDossiersByText("x", { bb: new Blackboard(), embed: async () => [] })).length === 0);
  }

  const _t: SiteDossierArtifact["type"] = "site.dossier"; // garde le type exporté utilisé
  void _t;

  console.log(`\n${fail === 0 ? "✅" : "❌"} site-artifacts : ${pass} pass, ${fail} fail`);
  if (fail > 0) process.exit(1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
