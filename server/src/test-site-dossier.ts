// Tests de la couche synthèse (#159 Phase 3-4). PUR, déterministe : buildDossier
// fusionne crawl + design + vision ; formatDossier rend le texte. On vérifie : la
// vision prime, les fallbacks gracieux (vision KO → mécaniques/infos dérivées du
// design et des titres), et le rendu texte (champs présents, mention vision KO).

import { buildDossier, formatDossier } from "./site-dossier.js";
import type { CrawlReport } from "./site-crawler.js";
import type { SiteDesign } from "./site-design.js";
import type { SiteVision } from "./site-vision.js";

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

const report = (pages: Array<{ url: string; title?: string; text?: string }>): CrawlReport => ({
  seed: pages[0]?.url ?? "",
  pages: pages.map((p) => ({ url: p.url, title: p.title ?? "", text: p.text ?? "", links: [], depth: 0, external: false })),
  skipped: [],
  truncated: false,
});

const design = (over: Partial<SiteDesign> = {}): SiteDesign => ({
  url: "https://jeu.com",
  ok: true,
  palette: ["#1f2937", "#f59e0b"],
  typographies: ["Inter"],
  graisses: ["400"],
  tokens: [],
  ambiance: "sombre · vif · chaud",
  layout: { titre: "Mon Jeu", sections: ["Univers", "Mécaniques"], nav: ["Accueil"], cta: ["Jouer"] },
  ...over,
});

const vision = (over: Partial<SiteVision> = {}): SiteVision => ({
  ok: true,
  concept: "Jeu d'aventure",
  publicCible: "ados",
  mecaniques: ["carte ouverte", "énigmes"],
  ambiance: "héroïque",
  ton: "épique",
  infos: ["sortie 2026"],
  raw: "…",
  ...over,
});

function run() {
  console.log("\n[1] buildDossier — la vision prime");
  {
    const d = buildDossier(report([{ url: "https://jeu.com", title: "Accueil" }, { url: "https://jeu.com/a" }]), design(), vision(), {
      objectif: "univers",
    });
    check("concept = vision", d.concept === "Jeu d'aventure");
    check("mécaniques = vision", d.mecaniques.join() === "carte ouverte,énigmes");
    check("mood = ambiance vision", d.mood === "héroïque");
    check("ton éditorial = vision", d.tonEditorial === "épique");
    check("infos = vision", d.infosCles.join() === "sortie 2026");
    check("design palette reprise", d.design.palette.includes("#f59e0b"));
    check("ambiance design (déterministe) distincte du mood", d.design.ambiance === "sombre · vif · chaud");
    check("pages visitées listées", d.pagesVisitees.length === 2);
    check("objectif conservé", d.objectif === "univers");
    check("visionOk", d.visionOk === true);
  }

  console.log("\n[2] buildDossier — fallback gracieux quand la vision est vide");
  {
    const emptyVis: SiteVision = { ok: false, concept: "", publicCible: "", mecaniques: [], ambiance: "", ton: "", infos: [], raw: "" };
    const d = buildDossier(report([{ url: "https://jeu.com", title: "Accueil du Jeu" }]), design(), emptyVis);
    check("concept fallback = titre/design", d.concept === "Accueil du Jeu");
    check("mécaniques fallback = sections+nav", d.mecaniques.includes("Univers") && d.mecaniques.includes("Accueil"));
    check("infos fallback = titres de pages", d.infosCles.includes("Accueil du Jeu"));
    check("visionOk false", d.visionOk === false);
  }

  console.log("\n[3] formatDossier — rendu texte");
  {
    const d = buildDossier(report([{ url: "https://jeu.com", title: "A" }]), design(), vision(), { objectif: "univers" });
    const txt = formatDossier(d);
    check("titre dossier", /# Dossier d'extraction — https:\/\/jeu\.com/.test(txt));
    check("concept rendu", txt.includes("**Concept** : Jeu d'aventure"));
    check("mécaniques rendues", txt.includes("- carte ouverte"));
    check("palette rendue", txt.includes("#f59e0b"));
    check("mood rendu", txt.includes("**Mood** : héroïque"));
    check("infos rendues", txt.includes("- sortie 2026"));
  }

  console.log("\n[4] formatDossier — mention vision indisponible");
  {
    const emptyVis: SiteVision = { ok: false, concept: "", publicCible: "", mecaniques: [], ambiance: "", ton: "", infos: [], raw: "" };
    const txt = formatDossier(buildDossier(report([{ url: "https://x.com", title: "T" }]), design(), emptyVis));
    check("note vision indisponible", /Vision indisponible/.test(txt));
  }

  console.log(`\n${fail === 0 ? "✅" : "❌"} site-dossier : ${pass} pass, ${fail} fail`);
  if (fail > 0) process.exit(1);
}

run();
