// Contrat de langage du projet (idée #45) — the project's Ubiquitous Language
// (Domain-Driven Design). Before/while building, Mango locks a SHARED LEXICON:
// one concept = one name = one component, from the first file to the last. It
// kills spaghetti at the root AND resolves fuzzy feedback ("the health bar is
// too small" → HealthBar.jsx in HUD/). The contract is a 4-column table:
//   | Terme naturel (humain) | Terme technique (domaine) | Composant / fichier | Description |
// The "Composant / fichier" column locks the structure and wires the lexicon
// onto click→source (#5).
//
// Three guardrails: (1) AUTO-GENERATED, not a form to fill; (2) LIVING — a new
// component adds a new row; (3) GROUNDED in the real (domain + components
// actually created), never a hallucinated lexical field.
//
// Door A (this file's generateLexique): the contract builds itself from the
// intention phrase in the background; if the domain is unknown to Mango, it
// first does deep web research because the lexicon is the project's foundation.
// Door B is folded into Mango Plan (#9) — no separate surface.
//
// Modeled on architecture.ts (#38): same load/save/RULES/promptSection shape,
// project-scoped artifact, character cap, "overridable default" injection,
// living maintenance by the agent.
import path from "node:path";
import fs from "node:fs";
import { claudeWebResearch } from "./llm/llm-engine.js";
import { getBrain } from "./kernel.js";

export const LEXIQUE_FILE_NAME = ".lexique.md";
const LEXIQUE_MAX_CHARS = 3000;

function loadCapped(file: string, maxChars: number): string {
  try {
    const text = fs.readFileSync(file, "utf8").trim();
    return text.length > maxChars
      ? `${text.slice(0, maxChars)}\n[... tronqué à ${maxChars} caractères — condense le fichier]`
      : text;
  } catch {
    return "";
  }
}

export function loadLexique(dir: string): string {
  return loadCapped(path.join(dir, LEXIQUE_FILE_NAME), LEXIQUE_MAX_CHARS);
}

export function saveLexique(dir: string, content: string): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, LEXIQUE_FILE_NAME), content, "utf8");
}

export const LEXIQUE_RULES = `
Project language contract (${LEXIQUE_FILE_NAME}) — the project's Ubiquitous Language:
- This file is the SHARED LEXICON of the project: one concept = ONE name = ONE component, from the first file to the last. It is your single source of truth for naming. Read it at the START of every turn (when it exists) and LOCK your vocabulary onto it across ALL files — components, variables, props, routes, copy.
- Shape: a 4-column Markdown table | Terme naturel (humain) | Terme technique (domaine) | Composant / fichier | Description |. The "Composant / fichier" column locks the structure and maps each concept to its real file.
- LIVING: whenever you create a new component/page/concept that carries domain meaning, ADD its row immediately (Write/Edit the file directly); when a concept is renamed, update its row. Keep it curated and concise (target < ${LEXIQUE_MAX_CHARS} chars), grounded ONLY in the actual domain and the components really created — never invent a lexical field.
- FUZZY FEEDBACK: when the user gives vague feedback in natural words ("the health bar is too small", "make the cart bigger"), resolve it through this table — match the natural term to its "Composant / fichier" and act on that exact file instead of guessing.
- This contract is a DEFAULT that the user's explicit naming choices override: if the user asks for a different name, follow them AND update the table.`;

/** System-prompt section injecting the current language contract ("" if empty). */
export function lexiquePromptSection(dir: string): string {
  const content = loadLexique(dir);
  if (!content) return "";
  return `\n\nProject language contract (${LEXIQUE_FILE_NAME}) — lock all naming onto this table; resolve fuzzy feedback through it:\n${content}`;
}

// Injectable brains so generateLexique is testable without the network, same
// discipline as eleve.ts/runRelay. Defaults wire the real ($0 subscription)
// engines; tests pass mocks.
export interface LexiqueDeps {
  ask: (system: string, user: string) => Promise<string>;
  webResearch: (prompt: string) => Promise<string>;
}

const defaultDeps: LexiqueDeps = {
  ask: (system, user) => getBrain().complete(system, user, { maxTokens: 1500 }),
  webResearch: (prompt) => claudeWebResearch(prompt),
};

// Heuristic: does the intention look like a specialized/unknown domain that
// warrants grounding the lexical field with web research first? Generic app
// vocabulary (todo, blog, portfolio, landing…) is well-known; niche business
// or technical jargon is not. Conservative — research is heavy ($0 but slow).
const COMMON_DOMAINS = [
  "todo", "tâche", "tache", "blog", "portfolio", "landing", "vitrine", "site",
  "boutique", "shop", "e-commerce", "ecommerce", "dashboard", "tableau de bord",
  "chat", "note", "calendrier", "agenda", "galerie", "formulaire", "quiz", "jeu",
];

function looksSpecialized(intention: string): boolean {
  const low = intention.toLowerCase();
  if (COMMON_DOMAINS.some((w) => low.includes(w))) return false;
  // Longer, descriptive intentions in a non-generic domain are the ones worth
  // grounding; a one-liner generic ask is not.
  return intention.trim().length > 40;
}

/**
 * Door A — builds the initial draft of the language contract from the user's
 * intention phrase via askLLM. If the domain looks specialized/unknown, first
 * grounds the lexical field with web research, THEN generates. Persists via
 * saveLexique. Idempotent: does nothing if .lexique.md already exists non-empty.
 * Deps are injectable (defaults = real $0-subscription engines) for testability.
 */
export async function generateLexique(
  dir: string,
  intention: string,
  deps: LexiqueDeps = defaultDeps,
): Promise<void> {
  // Idempotent: never regenerate over an existing non-empty contract.
  if (loadLexique(dir)) return;
  if (!intention.trim()) return;

  let domainContext = "";
  if (looksSpecialized(intention)) {
    try {
      domainContext = await deps.webResearch(
        `Pour un projet décrit ainsi : "${intention.trim()}". Identifie le DOMAINE métier et son vocabulaire spécialisé : 8-12 termes-clés du domaine, leur sens, et le terme naturel qu'un humain emploierait pour chacun. Synthèse concise en puces.`,
      );
    } catch {
      domainContext = "";
    }
  }

  const domainBlock = domainContext.trim()
    ? `\nContexte de domaine (champ lexical réel à ancrer, ne pas halluciner au-delà) :\n<domaine>\n${domainContext.trim()}\n</domaine>\n`
    : "";

  const system =
    "Tu établis le CONTRAT DE LANGAGE d'un projet logiciel (Ubiquitous Language du Domain-Driven Design) : un concept = un nom = un composant. Tu produis une table Markdown ancrée UNIQUEMENT sur le domaine réel, jamais un champ lexical inventé.";

  const user = `Intention du projet :\n"${intention.trim()}"\n${domainBlock}
Produis le contrat de langage initial de ce projet sous forme d'une table Markdown à EXACTEMENT 4 colonnes :

| Terme naturel (humain) | Terme technique (domaine) | Composant / fichier | Description |

Règles :
- 5 à 12 lignes, uniquement les concepts CENTRAUX du domaine de cette intention.
- "Terme naturel" = le mot qu'un humain emploie spontanément (ex: "barre de vie").
- "Terme technique" = le terme de domaine canonique (ex: "HealthPoints").
- "Composant / fichier" = le nom de composant React PascalCase + son fichier probable (ex: HealthBar.jsx — HUD/). Reste cohérent et plausible ; ce sont des défauts qui se verrouilleront sur les fichiers réels.
- Ancre tout sur le domaine réel ; n'invente pas de concept absent de l'intention.
- Réponds UNIQUEMENT avec un titre "# Contrat de langage" suivi de la table. Aucun autre texte.`;

  let draft = "";
  try {
    draft = await deps.ask(system, user);
  } catch {
    return; // errors are swallowed — Door A must never disrupt anything
  }
  draft = draft.trim();
  if (!draft) return;
  // Last-line idempotency guard against a race: don't clobber a contract that
  // appeared while we were generating.
  if (loadLexique(dir)) return;
  saveLexique(dir, draft);
}

// ── Pure helper: resolve a fuzzy natural-language phrase to lexicon rows ─────
// Feeds fuzzy-feedback resolution (#5/#43). Given the raw contract Markdown and
// a phrase, returns the matching table rows (component/file) ranked by keyword
// overlap on the "natural term" + description columns. Pure → fully testable.

const STOPWORDS = new Set([
  "le", "la", "les", "un", "une", "des", "de", "du", "the", "a", "is", "est",
  "trop", "très", "tres", "plus", "moins", "petit", "petite", "grand", "grande",
  "rends", "rend", "fais", "fait", "mets", "met", "et", "à", "au", "aux", "en",
  "il", "elle", "on", "ça", "ca", "ce", "cette", "pour", "avec", "sur", "dans",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

export interface LexiqueRow {
  natural: string;
  technical: string;
  component: string;
  description: string;
}

/** Parses the 4-column Markdown table out of the contract. Tolerant of the
 *  header/separator rows and surrounding prose. */
export function parseLexiqueRows(lexiqueMd: string): LexiqueRow[] {
  const rows: LexiqueRow[] = [];
  for (const raw of lexiqueMd.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line.startsWith("|")) continue;
    const cells = line
      .split("|")
      .slice(1, -1)
      .map((c) => c.trim());
    if (cells.length < 4) continue;
    // Skip the header row and the |---|---| separator row.
    if (/terme naturel/i.test(cells[0])) continue;
    if (cells.every((c) => /^:?-{1,}:?$/.test(c) || c === "")) continue;
    rows.push({
      natural: cells[0],
      technical: cells[1],
      component: cells[2],
      description: cells.slice(3).join(" "),
    });
  }
  return rows;
}

/**
 * Resolves a fuzzy phrase to the best-matching lexicon row(s). Matches keywords
 * from the phrase against the "natural term" + description columns. Returns rows
 * sorted by descending overlap; empty when nothing meaningfully matches (so an
 * off-topic phrase yields nothing). Pure.
 */
export function resolveNaturalTerm(lexiqueMd: string, phrase: string): LexiqueRow[] {
  const rows = parseLexiqueRows(lexiqueMd);
  if (rows.length === 0) return [];
  const phraseTokens = new Set(tokenize(phrase));
  if (phraseTokens.size === 0) return [];

  const scored = rows
    .map((row) => {
      const haystack = new Set(tokenize(`${row.natural} ${row.description}`));
      let score = 0;
      for (const t of phraseTokens) if (haystack.has(t)) score++;
      return { row, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.map((s) => s.row);
}
