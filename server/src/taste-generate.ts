// Moteur de Goût (#149) — couche GÉNÉRATION (cœur) : GLM ré-habille un fichier de
// design tokens pour incarner une direction, en gardant EXACTEMENT les mêmes noms
// de variables (structure/contenu du projet intacts = skin pure). Cerveau injecté.
//
// La sortie de cette couche (tokens.css ré-écrit) alimentera l'aperçu + screenshot
// + galerie (prochain increment, réutilise capturePreview/startPreview de #80/#138).

import { chatEleve } from "./eleve.js";

export const SKIN_SYSTEM = `Tu es un SKINNER de design tokens CSS.
On te donne le contenu ACTUEL d'un fichier tokens.css (des variables :root) et une DIRECTION
esthétique cible avec de VRAIES références captées (palette mesurée, typographies réelles, tokens, ambiance).
Ta tâche : réécrire ce fichier pour incarner la direction cible.
RÈGLES STRICTES :
- Garde EXACTEMENT les mêmes NOMS de variables — n'en supprime ni n'en ajoute AUCUNE.
- Change SEULEMENT les VALEURS (couleurs, familles de police, rayons, ombres, espacements si pertinent).
- Appuie-toi EN PRIORITÉ sur les vraies références captées (palette mesurée, typographies réelles).
- Reste cohérent : contrastes lisibles, échelle harmonieuse.
- Sors UNIQUEMENT le CSS final (le bloc :root complet), sans prose, sans balises markdown.`;

export interface SkinTokensResult {
  ok: boolean;
  css?: string;
  reason?: string;
  dropped?: string[]; // variables attendues mais absentes de la sortie
}

/** Noms de variables CSS déclarées (`--xxx:`) dans un texte CSS. */
export function extractCssVarNames(css: string): string[] {
  const out = new Set<string>();
  for (const m of css.matchAll(/(--[a-z0-9-]+)\s*:/gi)) out.add(m[1]);
  return [...out];
}

function stripFences(t: string): string {
  return t.replace(/```[a-z]*\n?/gi, "").trim();
}

/** Extrait le bloc :root { … } d'une sortie de modèle (tolère prose/fences autour). */
export function extractRootCss(text: string): string | null {
  const cleaned = stripFences(text);
  const i = cleaned.indexOf(":root");
  if (i === -1) return cleaned.includes("--") ? cleaned : null;
  const open = cleaned.indexOf("{", i);
  if (open === -1) return cleaned.slice(i);
  let depth = 0;
  for (let j = open; j < cleaned.length; j++) {
    if (cleaned[j] === "{") depth++;
    else if (cleaned[j] === "}") {
      depth--;
      if (depth === 0) return cleaned.slice(i, j + 1);
    }
  }
  return cleaned.slice(i);
}

export type SkinAsk = (system: string, user: string) => Promise<string>;

/**
 * Demande au cerveau (GLM par défaut) de ré-habiller le fichier tokens pour une
 * direction. Valide que les noms de variables sont préservés (seuil 15 %) — sinon
 * échec propre (on ne livrera pas un skin qui casse les variables consommées partout).
 */
export async function skinTokens(currentCss: string, brief: string, ask: SkinAsk): Promise<SkinTokensResult> {
  const want = extractCssVarNames(currentCss);
  if (want.length === 0) return { ok: false, reason: "aucune variable CSS dans le fichier source" };

  const user = [
    "DIRECTION ESTHÉTIQUE CIBLE (+ références réelles captées) :",
    brief,
    "",
    "FICHIER tokens.css ACTUEL (garde EXACTEMENT ces noms de variables) :",
    currentCss,
    "",
    "Réécris le fichier pour incarner la direction. Sors UNIQUEMENT le CSS.",
  ].join("\n");

  let raw: string;
  try {
    raw = await ask(SKIN_SYSTEM, user);
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message.split("\n")[0] : String(err) };
  }

  const css = extractRootCss(raw);
  if (!css) return { ok: false, reason: "aucun CSS exploitable en sortie" };

  const got = new Set(extractCssVarNames(css));
  const dropped = want.filter((v) => !got.has(v));
  if (dropped.length > Math.ceil(want.length * 0.15)) {
    return { ok: false, reason: `trop de variables perdues (${dropped.length}/${want.length})`, dropped };
  }
  return { ok: true, css, dropped };
}

/** Cerveau de skinning par défaut = l'Élève (GLM via Ollama Cloud), souverain. */
export function defaultSkinAsk(system: string, user: string): Promise<string> {
  return chatEleve(system, user);
}

// ─────────────────────────────────────────────────────────────────────────────
// Remap des couleurs CODÉES EN DUR (hex / rgba) que tokens.css ne couvre pas.
// GLM produit une CORRESPONDANCE couleur→couleur ; l'application est déterministe
// (find-replace exact) → sûr, GLM ne réécrit jamais les composants.
// ─────────────────────────────────────────────────────────────────────────────

export const REMAP_SYSTEM = `Tu es un remappeur de couleurs.
La palette d'une app change (anciens tokens → nouveaux tokens). On te donne une LISTE de
couleurs codées EN DUR trouvées dans le code (dégradés, rgba d'overlay) qui n'ont PAS suivi
le changement de palette. Produis une correspondance JSON { "ancienne": "nouvelle" } pour
CHAQUE couleur de la liste, cohérente avec le glissement :
- un dégradé sombre→accent reste sombre→accent dans la NOUVELLE teinte ;
- un rgba d'overlay garde son alpha mais glisse vers la nouvelle teinte ;
- garde le rôle et le contraste relatifs.
Sors UNIQUEMENT le JSON (clés = couleurs exactes de la liste), sans prose, sans markdown.`;

export interface FileContent {
  path: string;
  content: string;
}

const HEX_RE = /#[0-9a-fA-F]{3,8}\b/g;
const FUNC_RE = /rgba?\([^)]*\)/gi;

/** Couleurs littérales (hex + rgb/rgba) présentes dans un texte (chaînes exactes). */
export function collectColorLiterals(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(HEX_RE)) out.add(m[0]);
  for (const m of text.matchAll(FUNC_RE)) out.add(m[0]);
  return [...out];
}

/** Applique une correspondance couleur→couleur (clés les plus longues d'abord ;
 *  hex protégé pour ne pas matcher au milieu d'un hex plus long). */
export function applyColorMap(text: string, map: Record<string, string>): string {
  let out = text;
  for (const key of Object.keys(map).sort((a, b) => b.length - a.length)) {
    const val = map[key];
    if (!val || val === key) continue;
    const esc = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (key.startsWith("#")) out = out.replace(new RegExp(esc + "(?![0-9a-fA-F])", "g"), val);
    else out = out.replace(new RegExp(esc, "gi"), val);
  }
  return out;
}

/** Parse tolérant d'une correspondance JSON couleur→couleur (fences/prose tolérés). */
export function parseColorMap(raw: string): Record<string, string> {
  const cleaned = raw.replace(/```[a-z]*\n?/gi, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end <= start) return {};
  try {
    const obj = JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
    const map: Record<string, string> = {};
    for (const [k, v] of Object.entries(obj)) if (typeof v === "string" && v) map[k] = v;
    return map;
  } catch {
    return {};
  }
}

/**
 * Demande à GLM le remap des couleurs en dur des fichiers, et renvoie les fichiers ÉDITÉS
 * (find-replace déterministe). N'écrit rien sur disque. Ne lève jamais (fail-open : map vide).
 */
export async function remapLiterals(
  files: FileContent[],
  oldTokens: string,
  newTokens: string,
  ask: SkinAsk,
): Promise<{ map: Record<string, string>; edits: FileContent[] }> {
  const literals = [...new Set(files.flatMap((f) => collectColorLiterals(f.content)))];
  if (literals.length === 0) return { map: {}, edits: [] };

  const user = [
    "ANCIENS tokens (palette d'origine) :",
    oldTokens,
    "",
    "NOUVEAUX tokens (palette cible) :",
    newTokens,
    "",
    "Couleurs codées EN DUR à remapper (clés exactes attendues) :",
    literals.join("\n"),
    "",
    "Produis la correspondance JSON ancienne→nouvelle.",
  ].join("\n");

  let raw: string;
  try {
    raw = await ask(REMAP_SYSTEM, user);
  } catch {
    return { map: {}, edits: [] };
  }
  const map = parseColorMap(raw);
  const edits: FileContent[] = [];
  for (const f of files) {
    const next = applyColorMap(f.content, map);
    if (next !== f.content) edits.push({ path: f.path, content: next });
  }
  return { map, edits };
}

// ─────────────────────────────────────────────────────────────────────────────
// REDESIGN du hero (#149 v1.5) : GLM réécrit le <section> hero pour un layout
// RADICALEMENT différent + une vraie image de fond. Bien plus que le re-coloriage.
// ─────────────────────────────────────────────────────────────────────────────

export const HERO_SYSTEM = `Tu es un designer-développeur React de haut niveau.
On te donne le HERO (un seul <section>) de la page d'accueil d'un site, une DIRECTION esthétique
avec ses références réelles, et une URL d'IMAGE DE FOND réelle (photo pertinente).
Réécris CE <section> pour un layout RADICALEMENT différent de l'original (image plein écran +
overlay, OU split image|texte, OU bandeau éditorial) — change la COMPOSITION, pas que les couleurs.
RÈGLES STRICTES :
- L'image DOIT couvrir toute sa zone : background-size:cover + background-position:center (ou une
  <img> object-fit:cover width:100% height:100%). AUCUN espace ni couleur de remplissage visible.
- Le <section> fait 100% de largeur, SANS marge ni largeur fixe en px qui déborde (pas de scroll horizontal).
- Texte TOUJOURS lisible : overlay/scrim rgba entre l'image et le texte.
- Respecte palette/typo via var(--color-...) / var(--font-...).
- Styles INLINE comme l'original, AUCUN nouvel import, AUCUNE nouvelle dépendance, AUCUN composant externe.
- Renvoie UN SEUL <section>…</section> autonome qui compile (balises fermées, accolades équilibrées).
Sors UNIQUEMENT le JSX du <section>, sans prose ni markdown.`;

// Maille « héros » (#149 v2) : on IMPOSE une composition précise au lieu de laisser GLM
// choisir librement le layout. La structure imposée prime ; l'image s'y intègre selon la
// composition (plein écran, split, accent discret pour un hero minimal…).
export const HERO_SYSTEM_COMPOSED = `Tu es un designer-développeur React de haut niveau.
On te donne le HERO (un seul <section>) de la page d'accueil d'un site, une DIRECTION esthétique
avec ses références réelles, une URL d'IMAGE réelle, et surtout une COMPOSITION IMPOSÉE (structure obligatoire).
Réécris CE <section> en respectant EXACTEMENT la composition imposée (sa structure prime sur tout le reste).
RÈGLES STRICTES :
- Suis la COMPOSITION IMPOSÉE à la lettre (placement de l'image, du titre, du CTA, des colonnes).
- L'image s'intègre SELON la composition : plein écran (cover) si la composition le dit, dans une colonne
  si c'est un split, en bandeau si éditorial, ou en simple accent si la composition est minimale (alors pas
  de fond photo plein écran). Là où une image couvre une zone : cover + center, AUCUN espace de remplissage visible.
- Le <section> fait 100% de largeur, SANS marge ni largeur fixe en px qui déborde (pas de scroll horizontal).
- Texte TOUJOURS lisible : overlay/scrim rgba si le texte passe sur l'image.
- Respecte palette/typo via var(--color-...) / var(--font-...).
- Styles INLINE comme l'original, AUCUN nouvel import, AUCUNE nouvelle dépendance, AUCUN composant externe.
- Renvoie UN SEUL <section>…</section> autonome qui compile (balises fermées, accolades équilibrées).
Sors UNIQUEMENT le JSX du <section>, sans prose ni markdown.`;

/** Localise le 1er <section>…</section> (balisage équilibré) d'un composant. */
export function firstSectionRange(src: string): { before: string; hero: string; after: string } | null {
  const open = src.indexOf("<section");
  if (open === -1) return null;
  const re = /<\/?section\b/g;
  re.lastIndex = open;
  let depth = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    if (m[0].startsWith("</")) {
      depth--;
      if (depth === 0) {
        const end = src.indexOf(">", m.index) + 1;
        return { before: src.slice(0, open), hero: src.slice(open, end), after: src.slice(end) };
      }
    } else depth++;
  }
  return null;
}

/** Extrait un bloc <section>…</section> d'une sortie de modèle (fences/prose tolérés). */
export function extractSectionJsx(text: string): string | null {
  const cleaned = text.replace(/```[a-z]*\n?/gi, "").trim();
  const a = cleaned.indexOf("<section");
  const b = cleaned.lastIndexOf("</section>");
  if (a === -1 || b === -1 || b < a) return null;
  return cleaned.slice(a, b + "</section>".length);
}

export interface RedesignResult {
  ok: boolean;
  hero?: string;
  reason?: string;
}

/**
 * GLM réécrit le hero pour incarner la direction (layout radical + image de fond réelle).
 * Garde-fou : un seul <section> aux balises équilibrées. Ne lève jamais (→ repli token-only).
 *
 * Maille « héros » (#149 v2) : si `compositionBrief` est fourni, on IMPOSE cette composition
 * (structure obligatoire) au lieu de laisser GLM choisir le layout librement.
 */
export async function redesignHero(
  currentHero: string,
  brief: string,
  imageUrl: string,
  ask: SkinAsk,
  compositionBrief?: string,
): Promise<RedesignResult> {
  const composed = !!compositionBrief;
  const user = [
    "DIRECTION + RÉFÉRENCES :", brief, "",
    ...(composed ? [compositionBrief as string, ""] : []),
    `IMAGE DE FOND (utilise EXACTEMENT cette URL) : ${imageUrl}`, "",
    "HERO ACTUEL à réécrire :", currentHero, "",
    "Réécris le <section>.",
  ].join("\n");
  let raw: string;
  try {
    raw = await ask(composed ? HERO_SYSTEM_COMPOSED : HERO_SYSTEM, user);
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message.split("\n")[0] : String(err) };
  }
  const hero = extractSectionJsx(raw);
  if (!hero) return { ok: false, reason: "aucun <section> en sortie" };
  const opens = (hero.match(/<section\b/g) || []).length;
  const closes = (hero.match(/<\/section>/g) || []).length;
  if (opens === 0 || opens !== closes) return { ok: false, reason: "balises <section> déséquilibrées" };
  return { ok: true, hero };
}
