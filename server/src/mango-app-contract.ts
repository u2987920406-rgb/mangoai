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

export interface MangoAppCollection {
  name: string;
  access: CollectionAccess;
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
            .map((c) => ({ name: c.name, access: c.access ?? "readwrite" }))
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
    '  "collections": [{ "name": "tasks", "access": "readwrite" }]',
    "}",
    "```",
    "- `collections` liste les données PARTAGÉES que tu lis/écris (`access` : `read` | `write` | `readwrite`). C'est ce qui permet à une app sœur de voir tes données.",
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
