// #193 — Registre des PROJETS LOCAUX EXTERNES de la section Code (docs/plan-193-section-code.md,
// décision D3). Séparé de `workspace/`/`projects.ts` — INTACTS, jamais touchés par ce module.
//
// Un projet externe pointe sur un dossier HORS du contrôle de MangoOS (un dépôt quelconque de
// Raf sur son disque). Ajouter un projet externe crée TOUJOURS son coffre au même geste
// (`perimeter.ts::addGrantToFile`, MÊME registre que Réglages → Coffres — traçabilité unique,
// pas un 2e mécanisme de consentement parallèle). Retirer un projet externe NE révoque PAS le
// coffre (geste séparé, volontaire — un même dossier peut servir ailleurs).
//
// Patron I/O identique à `perimeter.ts` : écriture atomique, `file` injectable (tests).
import fs from "node:fs";
import path from "node:path";
import { atomicWriteFileSync, dataDir } from "./safe-io.js";
import { addGrantToFile, type GrantMode } from "./perimeter.js";

export interface ExternalProject {
  id: string;
  label: string;
  /** Chemin ABSOLU normalisé du dossier externe. */
  path: string;
  mode: GrantMode;
  addedAt: number;
}

const DATA_DIR = dataDir();
export const EXTERNAL_PROJECTS_FILE = path.join(DATA_DIR, "external-projects.json");

function normPath(p: string): string {
  return path.resolve(p);
}

function makeId(): string {
  return `ep_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** Lecture FAIL-SAFE. Absent/illisible/JSON invalide → [] (jamais une exception qui remonte). */
export function loadExternalProjects(file: string = EXTERNAL_PROJECTS_FILE): ExternalProject[] {
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
    if (!Array.isArray(raw)) return [];
    return raw.filter((p): p is ExternalProject =>
      !!p && typeof p === "object" &&
      typeof (p as ExternalProject).id === "string" &&
      typeof (p as ExternalProject).path === "string" &&
      ((p as ExternalProject).mode === "ro" || (p as ExternalProject).mode === "rw"),
    );
  } catch {
    return [];
  }
}

/** Écriture ATOMIQUE (tmp+rename via safe-io). */
export function saveExternalProjects(list: readonly ExternalProject[], file: string = EXTERNAL_PROJECTS_FILE): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  atomicWriteFileSync(file, JSON.stringify(list, null, 2));
}

export type AddExternalProjectResult =
  | { ok: true; project: ExternalProject }
  | { ok: false; error: string };

/**
 * Ajoute un projet externe : valide que le dossier existe RÉELLEMENT, dédoublonne par chemin
 * normalisé (un re-ajout du même dossier MET À JOUR l'entrée existante plutôt que d'en créer
 * une 2e), et crée le coffre correspondant au même geste (`addGrantToFile`, jamais sauté).
 */
export function addExternalProject(
  label: string,
  rawPath: string,
  mode: GrantMode,
  file: string = EXTERNAL_PROJECTS_FILE,
  grantsFile?: string,
): AddExternalProjectResult {
  const abs = normPath(rawPath);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) {
    return { ok: false, error: `dossier introuvable : ${rawPath}` };
  }
  const list = loadExternalProjects(file);
  const existing = list.find((p) => normPath(p.path) === abs);
  const project: ExternalProject = {
    id: existing?.id ?? makeId(),
    label: label.trim() || path.basename(abs),
    path: abs,
    mode,
    addedAt: existing?.addedAt ?? Date.now(),
  };
  const next = [...list.filter((p) => normPath(p.path) !== abs), project];
  saveExternalProjects(next, file);
  // Le coffre est TOUJOURS créé/mis à jour au même geste — un projet externe sans coffre
  // serait un projet listé mais jamais réellement accessible aux outils.
  addGrantToFile(abs, mode, grantsFile);
  return { ok: true, project };
}

/** Retire un projet externe du registre (le coffre reste — geste séparé, cf. en-tête). */
export function removeExternalProject(id: string, file: string = EXTERNAL_PROJECTS_FILE): ExternalProject[] {
  const next = loadExternalProjects(file).filter((p) => p.id !== id);
  saveExternalProjects(next, file);
  return next;
}

export function getExternalProject(id: string, file: string = EXTERNAL_PROJECTS_FILE): ExternalProject | undefined {
  return loadExternalProjects(file).find((p) => p.id === id);
}
