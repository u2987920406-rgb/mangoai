// Persistance des DOSSIERS DE SITE dans le Blackboard (#159 Phase 4).
//
// Le « Sharingan complet » produit un dossier structuré (concept/mécaniques/design/
// mood/ton) en explorant un site externe. Ici on le PERSISTE dans le Blackboard,
// dans un scope dédié `artifact:site`, pour qu'il devienne RÉUTILISABLE cross-projet :
// la prochaine fois qu'on bâtit un site « comme tel jeu », on retrouve le dossier
// déjà extrait au lieu de re-crawler. C'est la 1ʳᵉ extension des artefacts AU-DELÀ
// des palettes (fait avancer la limite L3).
//
// L'EMBEDDING réutilise `paletteEmbedding` (histogramme RGB déterministe, pur, $0)
// sur la palette du design capté → un dossier est retrouvable « par couleurs » au
// même titre qu'une palette, sans Ollama ni réseau. Dédup par URL normalisée
// (re-extraire le même site écrase, pas d'empilement). Ne lève jamais via l'appelant.

import { getBlackboard, type Blackboard, type BlackboardRef } from "./kernel-blackboard.js";
import { paletteEmbedding } from "./kernel-artifacts.js";
import { keywordRank, type Embed } from "./kernel-reuse.js";
import { embedOllama } from "./ollama.js";
import type { SiteDossier } from "./site-dossier.js";

/** Scope dédié aux dossiers de site (distinct des palettes design `artifact:design`). */
export const SITE_ARTIFACT_SCOPE = "artifact:site";

/** Scope dédié à l'index TEXTE des dossiers (#159 P4 / L3 Phase B) : retrouvables
 * « par CONCEPT » (embedding texte), pas seulement par couleur. Distinct du scope
 * palette ci-dessus car l'embedding y est de dimension différente (texte vs histogramme). */
export const SITE_TEXT_SCOPE = "artifact:site-text";

/** Embedder texte par défaut : Ollama, [] si indisponible → repli mots-clés. */
const defaultEmbed: Embed = async (t) => {
  try {
    return await embedOllama(t);
  } catch {
    return [];
  }
};

/** Forme persistée d'un dossier de site (sous-ensemble plat, sérialisable). */
export interface SiteDossierArtifact {
  type: "site.dossier";
  url: string;
  project: string; // domaine du site (provenance, pour l'affichage)
  concept: string;
  publicCible: string;
  mecaniques: string[];
  palette: string[];
  typographies: string[];
  ambiance: string; // ambiance palette (déterministe)
  mood: string; // mood sémantique (vision)
  tonEditorial: string;
  infosCles: string[];
  at: number;
}

/** Clé de dédup : URL normalisée (protocole/www/slash final retirés). PUR. */
export function dossierKey(url: string): string {
  return (url ?? "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/+$/, "");
}

/** Domaine lisible (apex) depuis une URL, pour la provenance. PUR. */
function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return dossierKey(url).split("/")[0] || "site";
  }
}

/**
 * Dépose un dossier de site dans le Blackboard. Renvoie sa ref, ou null si le
 * dossier est vide (ni concept ni palette — rien à réutiliser). L'embedding n'est
 * posé que si la palette a des couleurs valides (sinon dossier listable mais pas
 * trouvable par recherche couleur).
 */
export function recordSiteDossier(
  dossier: SiteDossier,
  bb: Blackboard = getBlackboard(),
  now: () => number = () => Date.now(),
): BlackboardRef | null {
  const palette = dossier.design?.palette ?? [];
  if (!dossier.concept && palette.length === 0) return null;

  const artifact: SiteDossierArtifact = {
    type: "site.dossier",
    url: dossier.url,
    project: domainOf(dossier.url),
    concept: dossier.concept,
    publicCible: dossier.publicCible,
    mecaniques: dossier.mecaniques.slice(0, 8),
    palette,
    typographies: dossier.design?.typographies ?? [],
    ambiance: dossier.design?.ambiance ?? "",
    mood: dossier.mood,
    tonEditorial: dossier.tonEditorial,
    infosCles: dossier.infosCles.slice(0, 8),
    at: now(),
  };

  const emb = paletteEmbedding(palette);
  return bb.put(SITE_ARTIFACT_SCOPE, dossierKey(dossier.url), artifact, emb.length ? emb : undefined);
}

// ── Lecture / recherche ──────────────────────────────────────────────────────
export interface SiteDossierHit {
  key: string;
  artifact: SiteDossierArtifact;
  score?: number;
}

/** Tous les dossiers de site persistés (cross-projet), plus récents en tête. */
export function listSiteDossiers(bb: Blackboard = getBlackboard()): SiteDossierHit[] {
  return bb
    .keys(SITE_ARTIFACT_SCOPE)
    .map((key) => ({ key, artifact: bb.get<SiteDossierArtifact>(SITE_ARTIFACT_SCOPE, key)! }))
    .filter((h) => h.artifact)
    .sort((a, b) => (b.artifact.at ?? 0) - (a.artifact.at ?? 0));
}

/** Les k dossiers dont la palette est la plus proche (cosinus) de `colors`. */
export function searchSiteDossiers(colors: string[], k = 5, bb: Blackboard = getBlackboard()): SiteDossierHit[] {
  const emb = paletteEmbedding(colors);
  if (emb.length === 0) return [];
  return bb
    .search(SITE_ARTIFACT_SCOPE, emb, k)
    .map((hit) => ({ key: hit.key, artifact: hit.value as SiteDossierArtifact, score: hit.score }));
}

// ── Recherche par CONCEPT (embedding TEXTE, #159 P4 / L3 Phase B) ─────────────
/** Représentation TEXTE d'un dossier pour l'embedding/les mots-clés (concept,
 * public, mécaniques, mood, ton, infos, typo). PUR. */
export function dossierText(a: SiteDossierArtifact): string {
  return [a.concept, a.publicCible, a.mecaniques.join(" "), a.mood, a.tonEditorial, a.infosCles.join(" "), a.typographies.join(" ")]
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
    .join(". ");
}

/** Indexe (TEXTE) les dossiers dans le scope dédié. Idempotent par timestamp `at`
 * (re-extraire un site → ré-embed). Best-effort : un dossier sans embedding reste
 * trouvable par le repli mots-clés. */
export async function indexSiteDossiersText(bb: Blackboard = getBlackboard(), embed: Embed = defaultEmbed): Promise<void> {
  for (const { key, artifact } of listSiteDossiers(bb)) {
    const existing = bb.get<SiteDossierArtifact>(SITE_TEXT_SCOPE, key);
    if (existing && existing.at === artifact.at) continue;
    const emb = await embed(dossierText(artifact));
    bb.put(SITE_TEXT_SCOPE, key, artifact, emb.length ? emb : undefined);
  }
}

/** Les k dossiers les plus pertinents à une requête TEXTE (recherche sémantique
 * Blackboard si l'embedding marche, repli mots-clés déterministe sinon). Ferme le
 * trou L3 « les dossiers ne sont trouvables que par couleur ». Ne lève jamais. */
export async function searchSiteDossiersByText(
  query: string,
  opts: { bb?: Blackboard; embed?: Embed; k?: number } = {},
): Promise<SiteDossierHit[]> {
  const bb = opts.bb ?? getBlackboard();
  const embed = opts.embed ?? defaultEmbed;
  const k = opts.k ?? 5;
  const all = listSiteDossiers(bb);
  if (all.length === 0) return [];
  try {
    await indexSiteDossiersText(bb, embed);
    const qEmb = await embed(query);
    if (qEmb.length > 0) {
      const ranked = bb
        .search(SITE_TEXT_SCOPE, qEmb, k)
        .map((hit) => ({ key: hit.key, artifact: hit.value as SiteDossierArtifact, score: hit.score }));
      if (ranked.length > 0) return ranked.slice(0, k);
    }
  } catch {
    /* repli mots-clés ci-dessous */
  }
  return keywordRank(all, (h) => dossierText(h.artifact), query, k);
}
