// #138 OS d'apps — Contrat MangoApp (génération-à-conformité).
//
// Pour qu'une suite d'apps se compose, chaque app doit se DÉCLARER : qui elle
// est, quelle entrée de nav elle apporte, quelles collections partagées elle
// lit/écrit. Ce manifest `.mangoapp.json` est le contrat. La fenêtre Suite le
// scanne (suite-routes.ts) pour cartographier « qui parle à qui » ; le bloc de
// prompt (mangoAppContractSection) impose à l'agent de l'écrire en mode 🧩.
//
// Pattern calqué sur perfect-plan.ts (load/save JSON défensif + section prompt
// "" hors contexte). Les tokens design restent gérés par design-system.ts —
// ici on impose juste leur RÉUTILISATION pour la cohérence visuelle inter-apps.
import fs from "node:fs";
import path from "node:path";

export type CollectionAccess = "read" | "write" | "readwrite";

// Schéma OPTIONNEL d'une collection : `champ -> type`. Type = "string" | "number"
// | "boolean" | "object" | "array" | "any", avec un "?" final pour rendre le champ
// facultatif (ex. "number?"). Volontairement léger (pas du JSON Schema) : assez pour
// garantir aux apps sœurs une forme fiable, sans imposer un outillage lourd.
export type CollectionSchema = Record<string, string>;

export interface MangoAppCollection {
  name: string;
  access: CollectionAccess;
  schema?: CollectionSchema;
}

export interface MangoAppNavEntry {
  label: string;
  route: string;
}

export interface MangoAppManifest {
  id: string;
  name: string;
  icon: string;
  color: string;
  navEntry: MangoAppNavEntry;
  collections: MangoAppCollection[];
  createdAt: string;
}

const FILE = ".mangoapp.json";

export function hasManifest(dir: string): boolean {
  return fs.existsSync(path.join(dir, FILE));
}

/** Lecture défensive : null si absent ou JSON corrompu (jamais d'exception). */
export function loadManifest(dir: string): MangoAppManifest | null {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(dir, FILE), "utf8")) as Partial<MangoAppManifest>;
    if (!raw || typeof raw.id !== "string" || typeof raw.name !== "string") return null;
    return {
      id: raw.id,
      name: raw.name,
      icon: typeof raw.icon === "string" ? raw.icon : "📦",
      color: typeof raw.color === "string" ? raw.color : "#f59e0b",
      navEntry: {
        label: raw.navEntry?.label ?? raw.name,
        route: raw.navEntry?.route ?? "/",
      },
      collections: Array.isArray(raw.collections)
        ? raw.collections
            .filter((c): c is MangoAppCollection => !!c && typeof c.name === "string")
            .map((c) => {
              const schema = normalizeSchema(c.schema);
              return { name: c.name, access: c.access ?? "readwrite", ...(schema ? { schema } : {}) };
            })
        : [],
      createdAt: typeof raw.createdAt === "string" ? raw.createdAt : new Date(0).toISOString(),
    };
  } catch {
    return null;
  }
}

export function saveManifest(
  dir: string,
  data: Omit<MangoAppManifest, "createdAt">,
): MangoAppManifest {
  fs.mkdirSync(dir, { recursive: true });
  const manifest: MangoAppManifest = { ...data, createdAt: new Date().toISOString() };
  fs.writeFileSync(path.join(dir, FILE), JSON.stringify(manifest, null, 2), "utf8");
  return manifest;
}

// ── ACL par app (#138 Phase 2) ──────────────────────────────────────────────
// Garde-fou de CONFORMANCE (pas de sécurité — local-first, pas de frontière de
// confiance) : une app qui a déclaré une collection en `read` ne doit pas y
// écrire. L'app s'identifie par l'en-tête `X-MangoApp-Id` = l'`id` de son
// manifest ; le backend retrouve le manifest et vérifie l'accès déclaré.

/** L'accès déclaré autorise-t-il l'écriture (write/readwrite) ? */
export function accessAllowsWrite(access: CollectionAccess | null | undefined): boolean {
  return access === "write" || access === "readwrite";
}

/** Cherche le manifest d'une app par `id` parmi des dossiers de projets.
 * Pur (délègue à loadManifest) — les dossiers sont fournis par l'appelant. */
export function findManifestById(dirs: string[], id: string): MangoAppManifest | null {
  if (!id) return null;
  for (const d of dirs) {
    const m = loadManifest(d);
    if (m && m.id === id) return m;
  }
  return null;
}

// ── Validation de schéma par collection (#138 Phase 2) ──────────────────────
// Garde-fou de CONFORMANCE de la DONNÉE : si une app déclare la forme d'une
// collection (`schema`), le backend refuse une écriture non conforme → les apps
// sœurs qui lisent la même collection peuvent compter sur la forme. Tout est pur.

/** Nettoie un `schema` brut en `champ -> type` (les entrées non-string sont jetées).
 * undefined si absent/vide/non-objet → pas de schéma = pas de contrainte (rétro-compat). */
export function normalizeSchema(raw: unknown): CollectionSchema | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const out: CollectionSchema = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "string" && v.trim()) out[k] = v.trim();
  }
  return Object.keys(out).length ? out : undefined;
}

/** Le type de base (sans le "?" optionnel) correspond-il à la valeur ? Type inconnu = toléré. */
function matchesType(val: unknown, base: string): boolean {
  switch (base) {
    case "string": return typeof val === "string";
    case "number": return typeof val === "number" && !Number.isNaN(val);
    case "boolean": return typeof val === "boolean";
    case "array": return Array.isArray(val);
    case "object": return val !== null && typeof val === "object" && !Array.isArray(val);
    case "any": return true;
    default: return true; // type non reconnu → ne bloque jamais (tolérant par principe)
  }
}

/** Valide un document contre un schéma de collection. Les champs HORS schéma sont
 * tolérés (compat ascendante) ; un champ requis manquant ou mal typé est rejeté. */
export function validateAgainstSchema(
  value: unknown,
  schema: CollectionSchema,
): { ok: true } | { ok: false; error: string } {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "le document doit être un objet" };
  }
  const obj = value as Record<string, unknown>;
  for (const [field, spec] of Object.entries(schema)) {
    const optional = spec.endsWith("?");
    const base = (optional ? spec.slice(0, -1) : spec).trim();
    const present = field in obj && obj[field] !== undefined;
    if (!present) {
      if (!optional) return { ok: false, error: `champ requis manquant : « ${field} » (${base})` };
      continue;
    }
    if (!matchesType(obj[field], base)) {
      const got = Array.isArray(obj[field]) ? "array" : obj[field] === null ? "null" : typeof obj[field];
      return { ok: false, error: `champ « ${field} » : attendu ${base}, reçu ${got}` };
    }
  }
  return { ok: true };
}

/** Schéma effectif d'une collection parmi des manifests : on PRÉFÈRE celui déclaré
 * par un ÉCRIVAIN (le producteur de la forme) ; à défaut, le premier trouvé. null si
 * personne ne déclare de schéma → aucune contrainte. */
export function findCollectionSchema(
  manifests: MangoAppManifest[],
  collection: string,
  slugFn: (s: string) => string,
): CollectionSchema | null {
  let fallback: CollectionSchema | null = null;
  for (const m of manifests) {
    for (const c of m.collections) {
      if (!c.schema || slugFn(c.name) !== collection) continue;
      if (accessAllowsWrite(c.access)) return c.schema;
      fallback ??= c.schema;
    }
  }
  return fallback;
}

/** Bloc de prompt injecté en mode 🧩 « App composable ». "" hors contexte
 * (projectDir vide) → zéro poids. Décrit le contrat que l'app DOIT respecter. */
export function mangoAppContractSection(dir: string): string {
  if (!dir) return "";
  const existing = loadManifest(dir);
  const lines = [
    "## CONTRAT MANGOAPP — tu construis UN composant d'une suite",
    "Cette app n'est PAS un silo : elle fait partie d'un OS d'apps personnelles qui se PARLENT (modèle Office). Tu construis donc une app autonome ET conforme au contrat suivant.",
    "",
    "### 1. Manifest `.mangoapp.json` (OBLIGATOIRE)",
    "Écris à la racine du projet un fichier `.mangoapp.json` qui te déclare :",
    "```json",
    "{",
    '  "id": "slug-stable",',
    '  "name": "Nom lisible de l\'app",',
    '  "icon": "📋",',
    '  "color": "#f59e0b",',
    '  "navEntry": { "label": "Tâches", "route": "/" },',
    '  "collections": [{ "name": "tasks", "access": "readwrite", "schema": { "title": "string", "done": "boolean", "priority": "number?" } }]',
    "}",
    "```",
    "- `collections` liste les données PARTAGÉES que tu lis/écris (`access` : `read` | `write` | `readwrite`). C'est ce qui permet à une app sœur de voir tes données.",
    "- `schema` (OPTIONNEL mais recommandé si tu ÉCRIS) déclare la forme d'un document : `champ: type` (types `string`/`number`/`boolean`/`object`/`array`, suffixe `?` = facultatif). Le backend REFUSE (422) une écriture non conforme → tes apps sœurs lisent une donnée fiable. Écris donc des documents qui respectent ton propre schéma.",
    "- Garde ce manifest À JOUR si tu ajoutes une collection partagée.",
    "",
    "### 2. Cohérence visuelle inter-apps",
    "Tu es une app PARMI d'autres dans la même suite : harmonise-toi avec le design system partagé (mêmes tokens de palette, typo, rayons). Ne pars pas dans un style isolé.",
  ];
  if (existing) {
    lines.push(
      "",
      "### Manifest actuel (déjà déclaré — réutilise-le, ne le réinvente pas)",
      `- **${existing.name}** (\`${existing.id}\`) — nav « ${existing.navEntry.label} » → \`${existing.navEntry.route}\``,
      existing.collections.length
        ? `- Collections : ${existing.collections.map((c) => `\`${c.name}\` (${c.access})`).join(", ")}`
        : "- Aucune collection partagée déclarée pour l'instant.",
    );
  }
  return lines.join("\n");
}
