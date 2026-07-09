// Couche SYNTHÈSE du « Sharingan complet » (#159 Phase 3-4). Fusionne les trois
// couches — navigation (texte multi-pages), design (palette/typo/ambiance) et
// vision (concept/mécaniques/mood déduits par le VL) — en UN dossier structuré :
// la « reformulation » que la chaîne agentique (GLM) réinjecte comme DONNÉE fiable.
//
// Tout est PUR et déterministe (zéro réseau) : `buildDossier` assemble, `formatDossier`
// rend en texte lisible. Les champs déduits par le VL priment ; à défaut (vision KO),
// on retombe gracieusement sur ce que le crawl et le design ont capté (titres, nav,
// sections). Persistance Blackboard `site.dossier` → Phase 4.

import type { CrawlReport } from "./site-crawler.js";
import type { SiteDesign } from "./site-design.js";
import type { SiteVision } from "./site-vision.js";

export interface SiteDossier {
  url: string;
  objectif?: string;
  pagesVisitees: string[];
  concept: string;
  publicCible: string;
  mecaniques: string[];
  design: {
    palette: string[];
    typographies: string[];
    ambiance: string; // ambiance palette (déterministe)
    layout: { titre: string; sections: string[]; nav: string[]; cta: string[] };
  };
  mood: string; // mood sémantique (vision)
  tonEditorial: string;
  infosCles: string[];
  sources: string[];
  visionOk: boolean; // la couche vision a-t-elle abouti ?
}

/** Fusionne les trois couches en un dossier structuré. PUR. */
export function buildDossier(
  report: CrawlReport,
  design: SiteDesign,
  vision: SiteVision,
  opts: { objectif?: string } = {},
): SiteDossier {
  const pages = report.pages.map((p) => p.url);
  const fallbackConcept = report.pages[0]?.title || design.layout.titre || "";

  // Mécaniques : la déduction du VL prime ; à défaut, on dérive des sections/nav.
  let mecaniques = vision.mecaniques.filter(Boolean);
  if (mecaniques.length === 0) {
    mecaniques = [...design.layout.sections, ...design.layout.nav].filter(Boolean).slice(0, 6);
  }

  // Infos clés : VL d'abord ; sinon, titres de pages distincts (provenance réelle).
  let infos = vision.infos.filter(Boolean);
  if (infos.length === 0) {
    infos = [...new Set(report.pages.map((p) => p.title).filter(Boolean))].slice(0, 6);
  }

  return {
    url: report.seed,
    objectif: opts.objectif,
    pagesVisitees: pages,
    concept: vision.concept || fallbackConcept,
    publicCible: vision.publicCible,
    mecaniques,
    design: {
      palette: design.palette,
      typographies: design.typographies,
      ambiance: design.ambiance,
      layout: design.layout,
    },
    mood: vision.ambiance,
    tonEditorial: vision.ton,
    infosCles: infos,
    sources: [...new Set(pages)],
    visionOk: vision.ok,
  };
}

/** Rend le dossier en texte structuré lisible (PUR). C'est la sortie réinjectée. */
export function formatDossier(d: SiteDossier): string {
  const L: string[] = [`# Dossier d'extraction — ${d.url}`];
  if (d.objectif) L.push(`Objectif : ${d.objectif}`);
  L.push("");
  L.push(`**Concept** : ${d.concept || "(indéterminé)"}`);
  if (d.publicCible) L.push(`**Public cible** : ${d.publicCible}`);
  if (d.mecaniques.length) {
    L.push("**Mécaniques / fonctionnalités** :");
    L.push(...d.mecaniques.slice(0, 8).map((m) => `- ${m}`));
  }

  L.push("", "**Design (Sharingan)** :");
  if (d.design.palette.length) L.push(`- Palette : ${d.design.palette.slice(0, 12).join(" ")}`);
  if (d.design.typographies.length) L.push(`- Typographies : ${d.design.typographies.slice(0, 6).join(", ")}`);
  L.push(`- Ambiance (palette) : ${d.design.ambiance}`);
  const lay: string[] = [];
  if (d.design.layout.sections.length) lay.push(`sections ${d.design.layout.sections.slice(0, 8).join(" · ")}`);
  if (d.design.layout.nav.length) lay.push(`nav ${d.design.layout.nav.slice(0, 8).join(" · ")}`);
  if (d.design.layout.cta.length) lay.push(`CTA ${d.design.layout.cta.slice(0, 5).join(" · ")}`);
  if (lay.length) L.push(`- Layout : ${lay.join(" — ")}`);

  if (d.mood) L.push("", `**Mood** : ${d.mood}`);
  if (d.tonEditorial) L.push(`**Ton éditorial** : ${d.tonEditorial}`);
  if (d.infosCles.length) {
    L.push("", "**Infos clés** :");
    L.push(...d.infosCles.slice(0, 8).map((i) => `- ${i}`));
  }

  L.push("", `**Pages visitées** (${d.pagesVisitees.length}) : ${d.pagesVisitees.slice(0, 12).join(", ")}`);
  if (!d.visionOk) {
    L.push("", "_(Vision indisponible : concept/mécaniques déduits du texte et du design seuls.)_");
  }
  return L.join("\n");
}
