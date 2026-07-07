// render-integrity.ts (É2, Loop Engineering 2026-07-07) — détecteur DÉTERMINISTE de
// casse visuelle, pour remplacer le volet « CASSÉ » actuellement délégué au juge VL
// dans taste-judge.ts (axiome 10 de methode-fable.md : la casse est mesurable, pas
// un jugement — ne jamais payer un juge LLM là où un test suffit).
//
// Réutilise le navigateur partagé de vision.ts::getBrowser (aucune 2ᵉ instance
// Chromium). NE DUPLIQUE PAS ce qu'eleve-parcours.ts couvre déjà (erreurs
// console/pageerror, `au moins une image chargée`) — le seul vrai neuf ici :
// débordement horizontal (scrollWidth > clientWidth) et chevauchement de texte
// (intersection substantielle de getBoundingClientRect() entre blocs de texte).
// Le comptage des images cassées est repris avec la MÊME technique que
// eleve-parcours (naturalWidth === 0) mais appliqué de façon EXHAUSTIVE (toutes
// les images, pas « au moins une charge ») — un besoin différent (noter un skin
// entier, pas valider une étape de parcours).
import type { Page } from "playwright";

export interface IntegrityMeasurements {
  scrollWidth: number;
  clientWidth: number;
  textOverlaps: number; // paires de blocs de texte substantiellement superposés
  brokenImages: number; // <img src="..."> avec naturalWidth === 0
  totalImages: number;
}

export interface IntegrityReport {
  broken: boolean;
  faults: string[];
}

export interface AnalyzeOptions {
  /** Marge anti-faux-positif sur le débordement (barres de scroll, arrondis sub-pixel). Défaut 4px. */
  scrollTolerancePx?: number;
  /** Nombre de paires de chevauchement toléré avant de considérer que c'est cassé. Défaut 0. */
  overlapMax?: number;
}

/** Cœur PUR — aucune dépendance navigateur, testable en isolation totale. */
export function analyzeIntegrity(m: IntegrityMeasurements, opts: AnalyzeOptions = {}): IntegrityReport {
  const faults: string[] = [];
  const tolerance = opts.scrollTolerancePx ?? 4;
  const overlapMax = opts.overlapMax ?? 0;

  if (m.scrollWidth - m.clientWidth > tolerance) {
    faults.push(`débordement horizontal (${m.scrollWidth}px de contenu pour ${m.clientWidth}px de viewport)`);
  }
  if (m.textOverlaps > overlapMax) {
    faults.push(`chevauchement de texte détecté (${m.textOverlaps} paire(s) de blocs superposés)`);
  }
  if (m.brokenImages > 0) {
    faults.push(`${m.brokenImages}/${m.totalImages} image(s) cassée(s) (naturalWidth=0)`);
  }
  return { broken: faults.length > 0, faults };
}

// Borne le coût O(n²) de la détection de chevauchement sur des pages très denses.
const MAX_TEXT_LEAVES = 300;
// Deux rectangles sont jugés "chevauchants" si leur intersection couvre plus de
// cette fraction du plus petit des deux — évite les faux positifs ancêtre/enfant
// (un <strong> dans son <p> parent partage presque tout son rect avec lui, mais
// seulement si le <p> lui-même a du texte direct, ce que le filtre "leaf" exclut
// la plupart du temps ; limite honnête : les cas de texte inline mixte peuvent
// encore produire un faux positif occasionnel — non éprouvé au-delà de ce test).
const OVERLAP_RATIO = 0.5;

/** Mesure la page ouverte (Playwright). Un seul `evaluate()`, pas de dépendance
 *  au reste du module — testable en isolant juste cette fonction si besoin. */
export async function measurePage(page: Page): Promise<IntegrityMeasurements> {
  return page.evaluate(
    ({ maxLeaves, overlapRatio }) => {
      const scrollWidth = document.documentElement.scrollWidth;
      const clientWidth = document.documentElement.clientWidth;

      const imgs = Array.from(document.images);
      const brokenImages = imgs.filter((img) => img.src && img.naturalWidth === 0).length;
      const totalImages = imgs.length;

      const all = Array.from(document.querySelectorAll("body *"));
      const leaves = all
        .filter((el) => {
          const hasDirectText = Array.from(el.childNodes).some(
            (n) => n.nodeType === 3 && (n.textContent ?? "").trim().length > 0,
          );
          return hasDirectText;
        })
        .slice(0, maxLeaves);
      const rects = leaves
        .map((el) => el.getBoundingClientRect())
        .filter((r) => r.width > 0 && r.height > 0);

      let textOverlaps = 0;
      for (let i = 0; i < rects.length; i++) {
        for (let j = i + 1; j < rects.length; j++) {
          const a = rects[i], b = rects[j];
          const ix = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
          const iy = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
          const interArea = ix * iy;
          if (interArea <= 0) continue;
          const minArea = Math.min(a.width * a.height, b.width * b.height);
          if (minArea > 0 && interArea / minArea > overlapRatio) textOverlaps++;
        }
      }

      return { scrollWidth, clientWidth, textOverlaps, brokenImages, totalImages };
    },
    { maxLeaves: MAX_TEXT_LEAVES, overlapRatio: OVERLAP_RATIO },
  );
}

/** Mesure + analyse en un appel — l'API attendue par les appelants (taste-render.ts). */
export async function measureIntegrity(page: Page, opts: AnalyzeOptions = {}): Promise<IntegrityReport> {
  const m = await measurePage(page);
  return analyzeIntegrity(m, opts);
}
