// Brouillons de la page d'accueil (2026-06-27) — « la home peut tout faire dès le départ ».
//
// La home était une conversation TEXTE sans disque ni outils. Désormais chaque conversation
// d'accueil a un BROUILLON sur disque (ses pièces jointes + son contexte), ce qui permet à
// l'Élève agentique d'y LIRE/extraire (lire_archive, lire_document, read_file, web). Le
// brouillon vit sous `workspace/.home/<convId>/` — dossier CACHÉ (préfixe `.`) → exclu de
// `listProjects` (il n'apparaît pas dans le sélecteur de projets ni l'App Builder).
//
// Quand Raf valide, le brouillon « gradue » en vrai projet workspace (createProject + copie
// des .assets + historique amorcé). Décisions Raf (2026-06-27) : brouillon PAR conversation ·
// graduation = bouton manuel ET proposition de Mango quand il détecte une intention de build.

import path from "node:path";
import fs from "node:fs";
import { WORKSPACE_DIR, createProject, projectDir } from "./projects.js";
import { appendHistory, type ChatEntry } from "./history.js";

const HOME_ROOT = path.join(WORKSPACE_DIR, ".home");
export const ASSETS_DIR_NAME = ".assets";

/** Id de conversation sûr pour un nom de dossier (le client envoie `c<timestamp>`). */
export function safeConvId(id: string): string {
  return String(id ?? "").replace(/[^a-zA-Z0-9-_]/g, "").slice(0, 48) || "default";
}

/** Dossier brouillon d'une conversation d'accueil (sous le dossier caché `.home`). */
export function homeScratchDir(convId: string): string {
  return path.join(HOME_ROOT, safeConvId(convId));
}

/** Crée le brouillon (+ son `.assets`) au besoin, renvoie son chemin. Ne lève pas. */
export function ensureHomeScratch(convId: string): string {
  const dir = homeScratchDir(convId);
  try { fs.mkdirSync(path.join(dir, ASSETS_DIR_NAME), { recursive: true }); } catch { /* best-effort */ }
  return dir;
}

/** Supprime le brouillon (à la suppression de la conversation côté UI). Ne lève pas. */
export function cleanHomeScratch(convId: string): void {
  try {
    fs.rmSync(homeScratchDir(convId), { recursive: true, force: true, maxRetries: 5, retryDelay: 150 });
  } catch { /* déjà parti / verrouillé */ }
}

// ── Persistance des conversations d'accueil (auto-save « façon ChatGPT ») ───────
// Chaque conversation d'accueil est sauvegardée dans son brouillon (`.home/<convId>/conv.json`)
// pour pouvoir y REVENIR depuis l'écran « Conversation ». Le titre = 1er message utilisateur.

export interface HomeConvMsg { role: string; content: string }
export interface HomeConversation {
  convId: string;
  title: string;
  messages: HomeConvMsg[];
  updatedAt: string;
}
const CONV_FILE = "conv.json";

function convTitle(messages: HomeConvMsg[]): string {
  const firstUser = messages.find((m) => m.role === "user" && m.content?.trim());
  const t = (firstUser?.content ?? "").trim().replace(/\s+/g, " ");
  if (!t) return "Conversation";
  return t.length > 60 ? `${t.slice(0, 60)}…` : t;
}

/** Sauvegarde (auto) une conversation d'accueil. Ignore s'il n'y a aucun message utilisateur. Ne lève pas. */
export function saveHomeConversation(convId: string, messages: HomeConvMsg[]): void {
  if (!messages?.some((m) => m.role === "user" && m.content?.trim())) return;
  try {
    const dir = ensureHomeScratch(convId);
    const conv: HomeConversation = {
      convId: safeConvId(convId),
      title: convTitle(messages),
      messages,
      updatedAt: new Date().toISOString(),
    };
    fs.writeFileSync(path.join(dir, CONV_FILE), JSON.stringify(conv, null, 2), "utf8");
  } catch { /* best-effort */ }
}

/** Liste les conversations d'accueil sauvegardées, plus récentes d'abord. Ne lève pas. */
export function listHomeConversations(): Array<{ convId: string; title: string; updatedAt: string; count: number }> {
  try {
    if (!fs.existsSync(HOME_ROOT)) return [];
    const out: Array<{ convId: string; title: string; updatedAt: string; count: number }> = [];
    for (const entry of fs.readdirSync(HOME_ROOT, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const file = path.join(HOME_ROOT, entry.name, CONV_FILE);
      if (!fs.existsSync(file)) continue;
      try {
        const conv = JSON.parse(fs.readFileSync(file, "utf8")) as HomeConversation;
        out.push({
          convId: conv.convId || entry.name,
          title: conv.title || "Conversation",
          updatedAt: conv.updatedAt || "",
          count: conv.messages?.length ?? 0,
        });
      } catch { /* fichier corrompu → ignoré */ }
    }
    return out.sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  } catch {
    return [];
  }
}

/** Charge une conversation d'accueil complète (ou null si absente/corrompue). Ne lève pas. */
export function loadHomeConversation(convId: string): HomeConversation | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(homeScratchDir(convId), CONV_FILE), "utf8")) as HomeConversation;
  } catch {
    return null;
  }
}

// ── Détection d'intention de CONSTRUIRE (pour proposer la graduation) ──────────
// Volontairement CONSERVATEUR (mot entier, accents normalisés) : on ne propose la
// graduation que sur un signal franc, jamais sur une simple discussion. PUR.
const BUILD_VERBS = [
  "construis", "construire", "construit", "code", "coder", "implemente", "implementer",
  "developpe", "developper", "genere", "generer", "fabrique", "fabriquer",
  "cree une app", "creer une app", "cree un site", "creer un site", "cree-moi", "fais-moi",
  "build", "lance le projet", "passe en atelier", "ouvre l atelier", "on construit", "on code",
];
const BUILD_NOUNS_NEAR = ["app", "application", "site", "page", "projet", "dashboard", "jeu", "landing"];

function normalize(s: string): string {
  return (s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Vrai si le message exprime une intention de CONSTRUIRE (≠ simplement discuter/lire). PUR. */
export function detectsBuildIntent(text: string): boolean {
  const t = normalize(text);
  if (!t.trim()) return false;
  const hasVerb = BUILD_VERBS.some((v) => new RegExp(`(^|[^a-z])${v.replace(/ /g, "\\s+")}([^a-z]|$)`).test(t));
  if (hasVerb) return true;
  // « fais une app », « je veux une application/site » + nom → intention de build
  const wantsThing = /(veux|voudrais|besoin d|fais|faire|monte|creons|construisons)/.test(t)
    && BUILD_NOUNS_NEAR.some((n) => new RegExp(`(^|[^a-z])${n}([^a-z]|$)`).test(t));
  return wantsThing;
}

/** Slug de projet pour la graduation (réutilise la convention du reste du repo). */
export function graduateSlug(name: string): string {
  return String(name ?? "")
    .toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "projet-mango";
}

/**
 * GRADUATION : promeut un brouillon d'accueil en VRAI projet workspace.
 * - scaffold le projet (createProject = template + npm install) ;
 * - copie les pièces jointes du brouillon (.assets) dans le projet ;
 * - amorce l'historique de chat du projet depuis la conversation d'accueil (le contexte SUIT) ;
 * - nettoie le brouillon.
 * Renvoie le nom de projet réel créé. `messages` = conversation d'accueil [{role, content}].
 */
export async function graduateHomeScratch(
  convId: string,
  desiredName: string,
  messages: Array<{ role: string; content: string }> = [],
  deps: { create?: typeof createProject } = {},
): Promise<{ name: string }> {
  const create = deps.create ?? createProject;
  const scratch = homeScratchDir(convId);

  // Nom unique (ne pas écraser un projet existant).
  const base = graduateSlug(desiredName);
  let name = base;
  for (let n = 2; fs.existsSync(projectDir(name)); n++) name = `${base}-${n}`;

  const dir = await create(name); // scaffold + npm install

  // Copier les pièces jointes du brouillon → projet/.assets
  const srcAssets = path.join(scratch, ASSETS_DIR_NAME);
  if (fs.existsSync(srcAssets)) {
    try { fs.cpSync(srcAssets, path.join(dir, ASSETS_DIR_NAME), { recursive: true }); } catch { /* best-effort */ }
  }

  // Amorcer l'historique : le contexte de la discussion d'accueil suit dans l'atelier.
  const seed: ChatEntry[] = messages
    .filter((m) => m.content?.trim())
    .map((m) => ({
      role: m.role === "user" ? "user" : "agent",
      text: m.content,
      ts: new Date().toISOString(),
    }));
  if (seed.length) {
    try { appendHistory(dir, seed); } catch { /* best-effort */ }
  }

  cleanHomeScratch(convId);
  return { name };
}
