// Learned skill library, transposed from Hermes Agent's skills system:
// reusable how-to patterns capitalized by the background reviewer under
// workspace/.skills/<class-level-name>/SKILL.md (YAML frontmatter with name
// and description). Progressive disclosure: only metadata is injected into
// the system prompt; the agent Reads the full SKILL.md on demand.
//
// #174 "Skills à invocation directe" : le format gagne deux clés optionnelles
// (`disable-model-invocation`, `arguments`) et deux capacités — lire le corps
// complet d'une skill (`readSkill`) et l'expanser en tour utilisateur avec
// substitution d'arguments (`expandSkillBody`, PURE). Une skill à invocation
// manuelle disparaît de `skillsPromptSection()` (l'Élève ne la déclenche plus
// tout seul) mais reste résolvable en direct par un `/slug` tapé au composer.
import path from "node:path";
import fs from "node:fs";
import { WORKSPACE_DIR } from "./projects.js";

export const SKILLS_DIR = path.join(WORKSPACE_DIR, ".skills");

export type SkillMeta = {
  name: string;
  description: string;
  file: string;
  // `slug` et `disableModelInvocation` sont toujours renseignés par
  // listSkills()/readSkill() ; optionnels dans le type pour ne pas alourdir les
  // fixtures de test qui n'exercent que le ranking (kernel-reuse).
  /** Nom du dossier `.skills/<slug>/` — l'identifiant tapé après `/`. */
  slug?: string;
  /** `disable-model-invocation: true` → invocation manuelle uniquement. */
  disableModelInvocation?: boolean;
};

/** Corps complet d'une skill, servi à la demande (endpoint + expansion). */
export type SkillFull = SkillMeta & {
  slug: string;
  disableModelInvocation: boolean;
  body: string;
  /** Noms positionnels déclarés dans le frontmatter (`arguments: [a, b]`). */
  arguments: string[];
};

// Frontmatter caps: the library is written by the background reviewer (an
// LLM), so a malformed SKILL.md must degrade gracefully — never flood the
// system prompt, never crash the turn that builds it.
const NAME_MAX_CHARS = 80;
const DESC_MAX_CHARS = 240;

function capLine(value: string, max: number): string {
  const flat = value.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

// Un slug de dossier est déjà slugifié à la création (a-z0-9-). On valide le
// slug reçu (URL) contre ce même jeu → pas de path traversal (`../`, `.`, `/`).
export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9_-]{1,64}$/i.test(slug);
}

/** Parse un frontmatter YAML minimal (une paire clé: valeur par ligne) + corps. */
function parseFrontmatter(text: string): { meta: Map<string, string>; body: string } {
  const meta = new Map<string, string>();
  const m = /^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?/.exec(text);
  if (!m) return { meta, body: text };
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (kv) meta.set(kv[1].toLowerCase(), kv[2].trim());
  }
  return { meta, body: text.slice(m[0].length) };
}

/** `arguments: [a, b]` ou `arguments: a, b` → ["a", "b"] (best-effort, jamais throw). */
export function parseArgNames(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .replace(/^\[|\]$/g, "")
    .split(",")
    .map((s) => s.trim().replace(/^["']|["']$/g, ""))
    .filter((s) => /^[A-Za-z_]\w*$/.test(s));
}

const isTrue = (raw: string | undefined): boolean => /^(true|yes|on|1)$/i.test((raw ?? "").trim());

export function listSkills(): SkillMeta[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(SKILLS_DIR, { withFileTypes: true });
  } catch {
    return []; // no library yet
  }
  const metas: SkillMeta[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const file = path.join(SKILLS_DIR, entry.name, "SKILL.md");
    try {
      // Métadonnées seulement : on ne lit que la tête (le frontmatter y tient).
      const head = fs.readFileSync(file, "utf8").slice(0, 2000);
      const { meta } = parseFrontmatter(head);
      metas.push({
        name: capLine(meta.get("name") ?? entry.name, NAME_MAX_CHARS),
        description: capLine(meta.get("description") ?? "", DESC_MAX_CHARS),
        file,
        slug: entry.name,
        disableModelInvocation: isTrue(meta.get("disable-model-invocation")),
      });
    } catch (err) {
      // Unreadable or missing SKILL.md → that skill is skipped, the rest of
      // the library (and the turn) survives.
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        console.warn(`[skills] ${entry.name}:`, err instanceof Error ? err.message : err);
      }
    }
  }
  return metas;
}

/**
 * Corps complet d'une skill par slug, ou null si introuvable/illisible/slug
 * invalide. Jamais throw. Sert l'endpoint `GET /api/skills/:slug` et l'expansion.
 */
export function readSkill(slug: string): SkillFull | null {
  if (!isValidSlug(slug)) return null;
  const file = path.join(SKILLS_DIR, slug, "SKILL.md");
  let text: string;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
  const { meta, body } = parseFrontmatter(text);
  return {
    name: capLine(meta.get("name") ?? slug, NAME_MAX_CHARS),
    description: capLine(meta.get("description") ?? "", DESC_MAX_CHARS),
    file,
    slug,
    disableModelInvocation: isTrue(meta.get("disable-model-invocation")),
    body: body.trimEnd(),
    arguments: parseArgNames(meta.get("arguments")),
  };
}

const escapeForRegex = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Expanse le corps d'une skill en tour utilisateur (PURE — cœur testable du
 * chemin `/slug` du composer). Substitution façon Claude Code :
 *  • `$ARGUMENTS` → tout le texte d'arguments tapé après le slug ;
 *  • `$1`, `$2`… → arguments positionnels (découpés sur les espaces) ;
 *  • `$nom` → positionnels nommés déclarés dans le frontmatter `arguments`.
 * Si le corps ne contient AUCUN placeholder et qu'il y a des arguments, ils
 * sont annexés à la fin (comportement par défaut de Claude Code).
 */
export function expandSkillBody(body: string, argsText: string, argNames: string[] = []): string {
  const trimmedArgs = argsText.trim();
  const parts = trimmedArgs.length ? trimmedArgs.split(/\s+/) : [];

  // Présence d'un placeholder, mesurée AVANT substitution (décide de l'annexe).
  const hasArguments = body.includes("$ARGUMENTS");
  const hasNumbered = /\$\d+/.test(body);
  const hasNamed = argNames.some((n) =>
    new RegExp(`\\$${escapeForRegex(n)}(?![A-Za-z0-9_])`).test(body),
  );

  let out = body.split("$ARGUMENTS").join(trimmedArgs);
  out = out.replace(/\$(\d+)/g, (_m, d: string) => parts[Number(d) - 1] ?? "");
  // Noms triés du plus long au plus court pour qu'un préfixe ($env) n'entame
  // pas un nom plus long ($environnement).
  const byLen = argNames
    .map((n, i) => ({ n, i }))
    .sort((a, b) => b.n.length - a.n.length);
  for (const { n, i } of byLen) {
    out = out.replace(new RegExp(`\\$${escapeForRegex(n)}(?![A-Za-z0-9_])`, "g"), parts[i] ?? "");
  }

  if (!hasArguments && !hasNumbered && !hasNamed && trimmedArgs) {
    out = `${out.trimEnd()}\n\n${trimmedArgs}`;
  }
  return out;
}

/**
 * Progressive disclosure: metadata only; the agent reads files on demand.
 * #174 : les skills à invocation manuelle (`disable-model-invocation`) sont
 * exclues — l'Élève ne les voit plus passivement, mais elles restent invocables
 * en direct par un `/slug` tapé au composer.
 */
export function skillsPromptSection(): string {
  const skills = listSkills().filter((s) => !s.disableModelInvocation);
  if (skills.length === 0) return "";
  const list = skills
    .map((s) => `- ${s.name}: ${s.description}\n  → ${s.file}`)
    .join("\n");
  return `\n\nLearned skills (how-to guides built from past sessions). Before starting, if one matches the task, Read its SKILL.md and follow it:\n${list}`;
}

/** Cheap change detector for the whole library (paths + sizes + mtimes). */
export function skillsSnapshot(): string {
  try {
    return fs
      .readdirSync(SKILLS_DIR, { recursive: true })
      .map(String)
      .sort()
      .map((rel) => {
        try {
          const st = fs.statSync(path.join(SKILLS_DIR, rel));
          return `${rel}:${st.isFile() ? st.size : "d"}:${st.mtimeMs}`;
        } catch {
          return `${rel}:gone`; // deleted between readdir and stat
        }
      })
      .join("|");
  } catch {
    return "";
  }
}
