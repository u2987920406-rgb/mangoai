// ABSTRACTION DE DOMAINE (Phase 3a) — la pièce qui débloque les compétences non-web.
//
// Constat : tout le pipeline supposait Vite + navigateur + port 5174 (templates web,
// check_build = `npm run build`, preview = Vite, capture = screenshot navigateur).
// Ajouter Unity (ou demain Godot, un CLI, …) n'était pas qu'« ajouter des outils » :
// c'était sortir du Vite hardcodé.
//
// Un `Domain` décrit COMMENT un projet se construit et se vérifie. Le domaine WEB est
// le défaut et reproduit EXACTEMENT le comportement actuel (zéro régression : le chemin
// web continue de passer par inspectProject). Le domaine UNITY est gaté (ELEVE_UNITY=on)
// et construit en headless via le CLI Unity.
//
// Choix de conception : domains.ts n'altère JAMAIS le hot path web. `inspectByDomain`
// délègue à inspectProject pour le web, et n'exécute la commande Unity que pour un projet
// Unity explicitement détecté/forcé. Tout est borné en temps et ne lève jamais.

import fs from "node:fs";
import path from "node:path";
import { runCmd, inspectProject, type Inspection } from "./inspection.js";

export type DomainId = "web" | "unity" | "godot";

export interface Domain {
  id: DomainId;
  label: string;
  /** Marqueur caractéristique (fichier relatif) qui signe un projet de ce domaine. */
  marker: string;
  /** Le projet à `dir` relève-t-il de ce domaine ? PUR (FS en lecture). */
  detect: (dir: string) => boolean;
  /** Le domaine est-il ACTIVÉ (gate) ? Le web l'est toujours ; Unity exige ELEVE_UNITY=on. */
  enabled: () => boolean;
}

// ── Domaine WEB (défaut, inchangé) ───────────────────────────────────────────

export const webDomain: Domain = {
  id: "web",
  label: "Web (React + Vite + Tailwind)",
  marker: "package.json",
  detect: (dir) => fs.existsSync(path.join(dir, "package.json")),
  enabled: () => true,
};

// ── Domaine UNITY (gaté ELEVE_UNITY=on) ──────────────────────────────────────

/** Marqueur Unity : un projet Unity contient toujours ProjectSettings/ProjectVersion.txt. */
const UNITY_MARKER = path.join("ProjectSettings", "ProjectVersion.txt");

export const unityDomain: Domain = {
  id: "unity",
  label: "Unity (C# / build natif headless)",
  marker: UNITY_MARKER,
  detect: (dir) => fs.existsSync(path.join(dir, UNITY_MARKER)),
  enabled: () => process.env.ELEVE_UNITY === "on",
};

// ── Domaine GODOT (gaté ELEVE_GODOT=on) ──────────────────────────────────────

/** Marqueur Godot : tout projet Godot 4 contient un `project.godot` à la racine. */
const GODOT_MARKER = "project.godot";

export const godotDomain: Domain = {
  id: "godot",
  label: "Godot 4 (GDScript / build & vérif headless)",
  marker: GODOT_MARKER,
  detect: (dir) => fs.existsSync(path.join(dir, GODOT_MARKER)),
  enabled: () => process.env.ELEVE_GODOT === "on",
};

export const DOMAINS: Domain[] = [unityDomain, godotDomain, webDomain]; // ordre = priorité de détection

/**
 * Résout le domaine d'un projet. Priorité : forçage explicite (MANGOOS_DOMAIN) >
 * détection d'un domaine non-web ACTIVÉ > web (défaut). Ne lève jamais.
 */
export function resolveDomain(dir: string): Domain {
  const forced = (process.env.MANGOOS_DOMAIN ?? "").toLowerCase();
  if (forced) {
    const d = DOMAINS.find((x) => x.id === forced);
    if (d) return d;
  }
  for (const d of DOMAINS) {
    if (d.id !== "web" && d.enabled() && d.detect(dir)) return d;
  }
  return webDomain;
}

// ── Vérification par domaine ─────────────────────────────────────────────────

/** Chemin du binaire Unity Editor (CLI). Donné par l'env (machine-dépendant). */
export function unityBinary(): string | null {
  const p = process.env.UNITY_PATH;
  return p && p.trim() ? p.trim() : null;
}

/**
 * Construit un projet Unity en HEADLESS via le CLI Editor :
 *   Unity -batchmode -quit -nographics -projectPath . -executeMethod Builder.PerformBuild -logFile -
 * Le template fournit Assets/Editor/Builder.cs (PerformBuild). Le code de sortie non nul
 * = build cassé (signal objectif équivalent à `vite build`). Ne lève jamais.
 */
export async function inspectUnity(dir: string, opts: { timeoutMs?: number } = {}): Promise<Inspection> {
  const timeoutMs = opts.timeoutMs ?? 600_000; // un build Unity est long
  const t0 = Date.now();
  const done = (signal: Inspection["signal"], detail: string, ok = false): Inspection => ({
    ok,
    signal,
    detail: detail.trim(),
    durationMs: Date.now() - t0,
  });

  const unity = unityBinary();
  if (!unity) {
    // Pas de moteur installé : on le DIT (pas un faux négatif silencieux).
    return done("no-build-script", "UNITY_PATH non défini — installe Unity Editor et exporte UNITY_PATH pour construire ce domaine.");
  }
  if (!unityDomain.detect(dir)) {
    return done("no-package", "Projet Unity introuvable (ProjectSettings/ProjectVersion.txt absent).");
  }

  const cmd =
    `"${unity}" -batchmode -quit -nographics -projectPath "${dir}" ` +
    `-executeMethod Builder.PerformBuild -buildTarget StandaloneWindows64 -logFile -`;
  const { code, out, timedOut } = await runCmd(cmd, dir, timeoutMs);
  if (timedOut) return done("timeout", out.slice(-800));
  if (code !== 0) return done("build-failed", out.slice(-1500));
  return done("ok", out.slice(-400), true);
}

/** Chemin du binaire Godot (de préférence l'exe CONSOLE sous Windows : sortie/headless fiables). */
export function godotBinary(): string | null {
  const p = process.env.GODOT_PATH;
  return p && p.trim() ? p.trim() : null;
}

/**
 * Vérifie un projet Godot 4 en HEADLESS. Godot NE renvoie PAS de code ≠ 0 sur une erreur
 * de script (observé : exit 0 même avec un Parse Error) → le signal objectif est la
 * présence de MARQUEURS d'erreur dans la sortie (`SCRIPT ERROR`, `Parse Error`,
 * `Failed to load script`…). On lance la scène principale quelques frames puis on quitte.
 * Ne lève jamais.
 */
export async function inspectGodot(dir: string, opts: { timeoutMs?: number } = {}): Promise<Inspection> {
  const timeoutMs = opts.timeoutMs ?? 180_000;
  const t0 = Date.now();
  const done = (signal: Inspection["signal"], detail: string, ok = false): Inspection => ({
    ok,
    signal,
    detail: detail.trim(),
    durationMs: Date.now() - t0,
  });

  const godot = godotBinary();
  if (!godot) {
    return done("no-build-script", "GODOT_PATH non défini — installe Godot 4 et exporte GODOT_PATH (exe console) pour vérifier ce domaine.");
  }
  if (!godotDomain.detect(dir)) {
    return done("no-package", "Projet Godot introuvable (project.godot absent).");
  }

  // --import compile/scanne les ressources ; --quit-after exécute la scène principale
  // quelques frames puis ferme (le script du template appelle aussi quit() en headless).
  const cmd = `"${godot}" --headless --path "${dir}" --quit-after 5`;
  const { code, out, timedOut } = await runCmd(cmd, dir, timeoutMs);
  if (timedOut) return done("timeout", out.slice(-800));
  // Détection des erreurs de script/chargement (le vrai signal, indépendant du code de sortie).
  const ERROR_MARKERS = /SCRIPT ERROR|Parse Error|Failed to (?:load|parse|instantiate)|Cannot open file|Invalid call|Compile Error/i;
  if (ERROR_MARKERS.test(out)) return done("build-failed", out.slice(-1500));
  if (code !== 0) return done("build-failed", out.slice(-1500));
  return done("ok", out.slice(-400), true);
}

/**
 * Inspection PLUGGABLE par domaine. Web → inspectProject (chemin actuel, INCHANGÉ).
 * Unity → build headless. Godot → vérif headless. Ne lève jamais. C'est le point d'entrée
 * que l'orchestrateur / check_build appelleront quand le multi-domaine sera branché (gaté).
 */
export async function inspectByDomain(dir: string, opts: { timeoutMs?: number } = {}): Promise<Inspection & { domain: DomainId }> {
  const domain = resolveDomain(dir);
  const insp =
    domain.id === "unity" ? await inspectUnity(dir, opts) : domain.id === "godot" ? await inspectGodot(dir, opts) : await inspectProject(dir, opts);
  return { ...insp, domain: domain.id };
}
