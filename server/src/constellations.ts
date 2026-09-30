// Idée #74 — « Super-skills par composition » (constellations). Un signal détecté
// sur la DEMANDE du tour (ex. « crée un formulaire de contact ») active une
// CONSTELLATION = un pack de règles coordonnées (validation + a11y + responsive +
// états + tests) injecté dans le system prompt AVANT la génération. C'est le
// pendant amont de l'armée #73 (qui audite APRÈS) : ici on GUIDE pendant la
// construction. Modèle d'injection = relevantNotesSection (détection sur le prompt
// → section pré-calculée dans agent.ts → bloc dans scenario.ts).
//
// Les constellations par défaut vivent en code (soignées, livrées). L'utilisateur
// en ajoute / surcharge / désactive via un fichier JSON éditable
// `workspace/.constellations.json` (éditeur léger dans le panneau Connaissances).
import path from "node:path";
import fs from "node:fs";
import { atomicWriteFileSync } from "./safe-io.js";
import type { ProjectType } from "./blueprints.js";

export interface Constellation {
  id: string; // identifiant stable (kebab-case) — sert de clé de merge
  label: string;
  emoji: string;
  keywords: string[]; // matchés (mot entier, normalisé) sur le prompt du tour
  projectTypes?: ProjectType[]; // signal complémentaire optionnel
  rules: string; // le pack de règles injecté dans le prompt
  enabled?: boolean; // défaut true ; false dans un override désactive le défaut
}

export const CONSTELLATIONS_FILE_NAME = ".constellations.json";

// Combien de constellations injectées au plus, et taille max de la section — on
// borne le prompt (l'idée #13 surveille la base ~33k tokens).
const MAX_ACTIVE = 3;
const SECTION_MAX_CHARS = 4000;

// ── Registre par défaut (livré) ──────────────────────────────────────────────
export const DEFAULT_CONSTELLATIONS: Constellation[] = [
  {
    id: "form",
    label: "Formulaire",
    emoji: "📝",
    keywords: [
      "formulaire", "form", "inscription", "signup", "contact",
      "champ", "saisie", "questionnaire", "newsletter",
    ],
    rules: `Constellation FORMULAIRE — when this turn builds or edits a form, apply ALL of:
- Validation: validate every field (required, format, range); show inline, specific error messages; disable submit while invalid or pending.
- Accessibility: every input has an associated <label> (or aria-label); errors announced (aria-invalid / aria-describedby); logical tab order; visible focus ring.
- States: handle pending (disable + spinner), success (confirmation), and error (network/server) — never just the happy path.
- Mobile: inputs and tap targets usable at 320px; appropriate inputMode/type (email/tel/number); no horizontal overflow.
- Robustness: trim inputs, guard empty/whitespace, prevent double submit; never trust client values alone.
- Tests: add a Vitest test on the pure validation logic when it is non-trivial.`,
  },
  {
    // Née de la mesure MangoQA (2026-09-30) : sur 21 projets audités, 9 sortaient
    // "red" et TOUJOURS sur les mêmes 3 branches — tests (6), accessibility (5),
    // architecture (5). Cause racine : seul le pack `form` portait des règles a11y,
    // donc une app catalogue/tableau de bord/liste ne recevait STRICTEMENT RIEN.
    // Ce pack rend généraliste ce qui n'était vrai que pour les formulaires.
    id: "interface",
    label: "Interface",
    emoji: "🖥️",
    keywords: [
      "liste", "list", "catalogue", "catalog", "tableau", "dashboard",
      "galerie", "gallery", "carte", "card", "grille", "grid",
      "navigation", "menu", "barre", "sidebar", "recherche", "search",
      "filtre", "filter", "tri", "sort", "page", "ecran", "section",
    ],
    rules: `Constellation INTERFACE — when this turn builds or edits any screen, list, card grid or navigation, apply ALL of:
- Accessibility (every interactive element): a real <button>/<a> for anything clickable — never a bare <div onClick> (unreachable by keyboard); an accessible name on every control (visible text, or aria-label for icon-only buttons); every <img> gets a meaningful alt (alt="" only if purely decorative); visible focus ring that is NOT permanently lit; heading order h1→h2→h3 with a single h1.
- Contraste & lisibilité: body text at least 16px and a contrast ratio >= 4.5:1 — check muted greys on tinted backgrounds, they are the usual offender.
- Responsive: no horizontal overflow at 320px width; tap targets >= 44x44px; text never truncated by an overflow:hidden that hides the end of a word.
- Architecture (non-trivial logic only): keep components focused — split a file that both fetches data, holds state and renders a big tree; extract a component the moment it is duplicated in a second file (DRY); no dead code.
- Tests: any non-trivial non-visual logic that this screen relies on (filtering, sorting, computing, formatting, validation) gets a focused Vitest test on the pure function (happy path + 1-2 edge cases). Never ask for tests on markup or styling.`,
  },
];

// ── Normalisation + matching par mot entier ──────────────────────────────────
/** minuscule + sans accents (NFD) → matching robuste aux variantes d'écriture. */
function norm(s: string): string {
  return (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Le keyword (normalisé) apparaît-il comme MOT ENTIER dans le texte ? Évite que
 * "form" matche "information"/"performance". */
function matchesKeyword(normText: string, keyword: string): boolean {
  const k = norm(keyword).trim();
  if (!k) return false;
  return new RegExp(`(^|[^a-z0-9])${escapeRegExp(k)}([^a-z0-9]|$)`).test(normText);
}

// ── Lecture / écriture du fichier de config utilisateur ──────────────────────
function configPath(workspaceDir: string): string {
  return path.join(workspaceDir, CONSTELLATIONS_FILE_NAME);
}

/** Texte brut du `.constellations.json` (pour l'éditeur), "" si absent/illisible. */
export function loadConstellationsConfig(workspaceDir: string): string {
  try {
    return fs.readFileSync(configPath(workspaceDir), "utf8");
  } catch {
    return "";
  }
}

/** Valide que `content` parse en un TABLEAU JSON (sinon throw → route 400), puis
 * écrit atomiquement. */
export function saveConstellationsConfig(workspaceDir: string, content: string): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("JSON invalide");
  }
  if (!Array.isArray(parsed)) throw new Error("Le fichier doit être un tableau JSON de constellations");
  fs.mkdirSync(workspaceDir, { recursive: true });
  atomicWriteFileSync(configPath(workspaceDir), content);
}

/** Constellations custom valides du fichier. Tolérant : fichier absent ou JSON
 * invalide → [] ; chaque entrée doit avoir un `id` string non vide (le reste est
 * optionnel pour permettre un override partiel, ex. {id, enabled:false}). */
export function loadCustomConstellations(workspaceDir: string): Constellation[] {
  const raw = loadConstellationsConfig(workspaceDir);
  if (!raw.trim()) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: Constellation[] = [];
  for (const item of parsed) {
    if (typeof item !== "object" || item === null) continue;
    const v = item as Record<string, unknown>;
    if (typeof v.id !== "string" || !v.id.trim()) continue;
    out.push({
      id: v.id.trim(),
      label: typeof v.label === "string" ? v.label : v.id.trim(),
      emoji: typeof v.emoji === "string" ? v.emoji : "✨",
      keywords: Array.isArray(v.keywords) ? v.keywords.filter((k): k is string => typeof k === "string") : [],
      projectTypes: Array.isArray(v.projectTypes)
        ? (v.projectTypes.filter((t): t is ProjectType => typeof t === "string") as ProjectType[])
        : undefined,
      rules: typeof v.rules === "string" ? v.rules : "",
      enabled: typeof v.enabled === "boolean" ? v.enabled : undefined,
    });
  }
  return out;
}

/** Liste EFFECTIVE : défauts mergés champ-par-champ avec les overrides custom (même
 * id → surcharge les champs fournis ; id nouveau → ajout), puis on retire les
 * `enabled:false`. Un override `{id:"form", enabled:false}` désactive sans perdre
 * les règles du défaut. */
export function resolveConstellations(workspaceDir: string): Constellation[] {
  const byId = new Map<string, Constellation>(DEFAULT_CONSTELLATIONS.map((c) => [c.id, { ...c }]));
  for (const cu of loadCustomConstellations(workspaceDir)) {
    const base = byId.get(cu.id);
    byId.set(cu.id, base ? { ...base, ...cu } : cu);
  }
  return [...byId.values()].filter((c) => c.enabled !== false);
}

/** Marque l'origine d'une constellation pour l'affichage (défaut vs perso). */
export function isDefaultConstellation(id: string): boolean {
  return DEFAULT_CONSTELLATIONS.some((c) => c.id === id);
}

// ── Détection + section injectée (cœur) ──────────────────────────────────────
/** Constellations déclenchées par CE tour : un keyword (mot entier) présent dans
 * le prompt OU projectType ∈ projectTypes. Capée à MAX_ACTIVE. Ne retient que
 * celles ayant des règles à injecter. */
export function detectConstellations(
  prompt: string,
  projectType: ProjectType,
  workspaceDir: string,
): Constellation[] {
  const t = norm(prompt);
  const hits = resolveConstellations(workspaceDir).filter((c) => {
    if (!c.rules.trim()) return false;
    const byKeyword = c.keywords.some((k) => matchesKeyword(t, k));
    const byType = c.projectTypes?.includes(projectType) ?? false;
    return byKeyword || byType;
  });
  return hits.slice(0, MAX_ACTIVE);
}

/** Bloc prêt à injecter (titre + règles des constellations déclenchées), capé.
 * "" quand aucune ne se déclenche → zéro poids. */
export function constellationsSection(
  prompt: string,
  projectType: ProjectType,
  workspaceDir: string,
): string {
  const active = detectConstellations(prompt, projectType, workspaceDir);
  if (active.length === 0) return "";
  const body = active.map((c) => c.rules.trim()).join("\n\n");
  const capped = body.length > SECTION_MAX_CHARS ? `${body.slice(0, SECTION_MAX_CHARS)}\n…(truncated)` : body;
  return `\n\nActive skill constellations (idea #74) — this request matched the context below; treat these as REQUIRED quality rules for what you build this turn:\n${capped}`;
}
