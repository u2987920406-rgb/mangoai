// Bibliothèque de templates de DOMAINE (nuit du 2026-07-03 — level-up).
//
// ~20 manifests markdown (server/templates/*.md), un par domaine d'app (landing
// SaaS, jeu arcade, dashboard, restaurant…). Un manifest transmet à l'Élève le
// squelette structurel, les contraintes design du domaine (typo, palette, motion),
// les pièges AVOID et les composants canoniques — il ne code PAS à sa place
// (directive transmission). Compilé depuis la recherche web du 2026-07-03
// (docs/recherche-web-2026-07-03.md) : zéro dépendance réseau au runtime.
//
// Détection PURE et SYNCHRONE par mots-clés sur la demande du tour (même esprit
// que constellations #74) : normalisation désaccentuée + frontière de mots, le
// meilleur score gagne, "" si aucun domaine ne matche (comportement inchangé).
// Les manifests cohabitent avec les STARTERS techniques (server/templates/<dossier>/,
// vitrine/phaser/…) : seuls les fichiers .md à la racine sont des manifests.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_TEMPLATES_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "templates");

export interface DomainTemplate {
  domaine: string;
  keywords: string[];
  body: string; // manifest complet, frontmatter retiré
}

/** Minuscules + désaccentué — même demande, mêmes mots, avec ou sans accents. */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/** Parse un manifest : frontmatter `domaine:` + `détection: [a, b, …]`. PUR. */
export function parseManifest(raw: string): DomainTemplate | null {
  const fm = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!fm) return null;
  const head = fm[1] ?? "";
  const domaine = head.match(/^domaine:\s*(\S+)\s*$/m)?.[1];
  const det = head.match(/^d[ée]tection:\s*\[([^\]]*)\]\s*$/m)?.[1];
  if (!domaine || !det) return null;
  const keywords = det
    .split(",")
    .map((k) => normalize(k.trim()))
    .filter((k) => k.length >= 3); // « ia » trop court/ambigu — un mot-clé porte du sens
  if (!keywords.length) return null;
  return { domaine, keywords, body: raw.slice(fm[0].length).trim() };
}

// Cache par dossier (les tests injectent un dossier temporaire).
const cacheByDir = new Map<string, DomainTemplate[]>();

/** Charge (et met en cache) les manifests .md à la racine du dossier de templates. */
export function loadDomainTemplates(dir: string = DEFAULT_TEMPLATES_DIR): DomainTemplate[] {
  const hit = cacheByDir.get(dir);
  if (hit) return hit;
  const out: DomainTemplate[] = [];
  try {
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith(".md")) continue;
      try {
        const parsed = parseManifest(fs.readFileSync(path.join(dir, f), "utf8"));
        if (parsed) out.push(parsed);
      } catch {
        /* manifest illisible → ignoré (jamais bloquant) */
      }
    }
  } catch {
    /* dossier absent → bibliothèque vide, comportement d'avant */
  }
  cacheByDir.set(dir, out);
  return out;
}

/** (tests) vide le cache d'un dossier. */
export function clearTemplateCache(dir?: string): void {
  if (dir) cacheByDir.delete(dir);
  else cacheByDir.clear();
}

/** Score d'un template contre une demande normalisée : somme des mots-clés présents
 * (frontière de mots), les mots-clés multi-mots/longs pèsent plus. PUR. */
export function scoreTemplate(t: DomainTemplate, normQuery: string): number {
  let score = 0;
  for (const k of t.keywords) {
    const re = new RegExp(`(?:^|[^\\p{L}\\p{N}])${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:$|[^\\p{L}\\p{N}])`, "u");
    if (re.test(normQuery)) score += k.includes(" ") ? 3 : k.length >= 6 ? 2 : 1;
  }
  return score;
}

/** Détecte le domaine de la demande. null si rien d'assez net (seuil 2 : un seul
 * mot-clé court/générique ne suffit pas à imposer un template). */
export function detectDomain(query: string, dir: string = DEFAULT_TEMPLATES_DIR): DomainTemplate | null {
  const nq = normalize(query);
  let best: DomainTemplate | null = null;
  let bestScore = 0;
  for (const t of loadDomainTemplates(dir)) {
    const s = scoreTemplate(t, nq);
    if (s > bestScore) {
      best = t;
      bestScore = s;
    }
  }
  return bestScore >= 2 ? best : null;
}

/** Section prête à injecter dans le prompt système ("" si aucun domaine détecté). */
export function domainTemplateSection(query: string, dir: string = DEFAULT_TEMPLATES_DIR): string {
  const t = detectDomain(query, dir);
  if (!t) return "";
  return `\n\n## TEMPLATE DE DOMAINE « ${t.domaine} » (bibliothèque locale — suis-le, il prime sur le générique)\n${t.body}\n`;
}
