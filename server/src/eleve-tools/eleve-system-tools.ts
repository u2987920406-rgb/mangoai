// #180 É6 — Palier système gaté (DESKTOP_SYSTEM_SHELL, OFF déf., INTERACTIF-seulement)
// + outils déterministes (open_folder/reveal_in_explorer/open_url) + fail-safe absolu
// en contexte autonome. Voir docs/plan-180-interface-autonome.md, décisions D4/D5/D7.
//
// TROIS COUCHES (D5), du plus sûr au plus large — la couche 3 n'affaiblit JAMAIS les
// couches 1 et 2 :
//   1. FORBIDDEN_RUN (executor.ts)     — plancher inviolable, réutilisé TEL QUEL.
//   2. Allowlist builds (existante)    — run_command d'aujourd'hui, inchangée.
//   3. Palier système (NOUVEAU ICI)    — gate DESKTOP_SYSTEM_SHELL, chaque FAMILLE de
//      commande approuvée UNE FOIS par session (mémorisée en mémoire, PAS un shell
//      libre). git reste HORS allowlist (CLAUDE.md : zéro git non explicite).
//
// FAIL-SAFE ABSOLU (D4) : si `currentActor()==='autonomous'`, CE PALIER EST TOUJOURS
// REFUSÉ, même si le gate est ON. Ce n'est pas une option de configuration — c'est un
// test en dur AVANT toute lecture de gate, à chaque point d'entrée.
//
// D7 : chaque refus en contexte autonome (et chaque commande interdite) enregistre un
// incident de périmètre (perimeter-incidents.ts) — lu par decideBreakerStop
// (nocturnal.ts) à la frontière d'itération suivante.

import { spawn } from "node:child_process";
import path from "node:path";
import { z } from "zod";
import type { KernelTool, KernelToolResult } from "../kernel/kernel-mcp.js";
import { flag } from "../flags.js";
import { currentActor } from "../perimeter-context.js";
import { FORBIDDEN_RUN } from "../executor.js";
import { recordPerimeterIncident } from "../perimeter-incidents.js";

// ── Familles de commandes système (allowlist NOMMÉE, jamais un shell libre) ─────
//
// Chaque famille est un usage NOMMABLE et borné (D5 : « préférer l'outil déterministe,
// et à défaut une famille nommée, jamais un shell libre »). git est délibérément ABSENT
// (CLAUDE.md : « Zéro opération git sans permission explicite de Raf »).

export interface SystemCommandFamily {
  id: string;
  label: string;
  /** Teste si une commande appartient à cette famille (matching explicite, pas de regex fourre-tout). */
  match: (command: string) => boolean;
}

export const SYSTEM_COMMAND_FAMILIES: SystemCommandFamily[] = [
  {
    id: "dev-tool",
    label: "Ouvrir un outil de développement (VS Code)",
    match: (c) => /^(code|code-insiders)\b/i.test(c.trim()),
  },
  {
    id: "node-info",
    label: "Inspection de l'environnement Node/npm (lecture seule, aucune installation)",
    match: (c) => /^(node\s+--version|npm\s+--version|npm\s+config\s+get\b|where\s+node|which\s+node)\b/i.test(c.trim()),
  },
];

/** Trouve la famille d'une commande. `undefined` = hors des familles connues → REFUS
 *  (ce palier n'est PAS un shell libre : pas de famille nommée, pas d'exécution). */
export function matchFamily(command: string): SystemCommandFamily | undefined {
  return SYSTEM_COMMAND_FAMILIES.find((f) => f.match(command));
}

/**
 * Décision PURE d'approbation par famille (D5 : « à la manière des prompts de
 * permission de Claude Code, chaque famille nouvelle surfacée UNE FOIS »).
 */
export function needsApproval(familyId: string, approved: ReadonlySet<string>): boolean {
  return !approved.has(familyId);
}

// Mémorisation PAR PROCESS (une « session » = durée de vie du process serveur — même
// granularité que le verrou agentique agent-lock.ts). Remise à zéro au redémarrage :
// jamais de blanc-seing qui survit à un redéploiement.
const approvedFamilies = new Set<string>();

/** Approuve une famille pour la session courante (mémoire seule, jamais persistée). */
export function approveFamily(familyId: string): void {
  approvedFamilies.add(familyId);
}

/** Familles approuvées cette session (lecture, audit/tests). */
export function approvedFamiliesSnapshot(): string[] {
  return [...approvedFamilies];
}

/** Réinitialise les familles approuvées (tests uniquement). */
export function resetApprovedFamilies(): void {
  approvedFamilies.clear();
}

function runSystemCommand(command: string, timeoutMs: number): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    const proc = spawn(command, { shell: true, windowsHide: true });
    let out = "";
    const cap = (d: Buffer) => { out += d.toString(); if (out.length > 4000) out = out.slice(-4000); };
    proc.stdout?.on("data", cap);
    proc.stderr?.on("data", cap);
    const timer = setTimeout(() => {
      try { proc.kill(); } catch { /* déjà mort */ }
      resolve({ code: -1, out: `${out}\n(délai dépassé)` });
    }, timeoutMs);
    proc.on("exit", (code) => { clearTimeout(timer); resolve({ code: code ?? -1, out }); });
    proc.on("error", (e) => { clearTimeout(timer); resolve({ code: -1, out: (e as Error).message }); });
  });
}

export interface SystemCommandResult {
  ok: boolean;
  text: string;
  isError?: boolean;
}

/**
 * Exécute une commande du PALIER SYSTÈME (D5, gate DESKTOP_SYSTEM_SHELL). Ordre des
 * gardes, du plus dur au plus souple — chacune COURT-CIRCUITE la suivante :
 *   1. FAIL-SAFE ACTEUR — `currentActor()==='autonomous'` → refus INCONDITIONNEL, même
 *      gate ON (D4/D7, pas une option). Enregistre un incident breaker.
 *   2. Gate OFF → refus (le palier n'existe pas, comportement historique).
 *   3. FORBIDDEN_RUN (plancher executor.ts) → refus, JAMAIS contourné même approuvé.
 *      Une tentative en contexte autonome est déjà écartée à l'étape 1 ; ici on couvre
 *      le cas où un futur appelant oublierait le test d'acteur en amont : DEUX gardes,
 *      jamais une seule, sur un plancher de sûreté.
 *   4. Famille inconnue → refus pédagogique (PAS un shell libre).
 *   5. Famille connue mais pas encore approuvée cette session → « approbation requise ».
 *   6. Famille approuvée → exécution, timeout borné.
 */
export async function runSystemPaletteCommand(
  command: string,
  approved: ReadonlySet<string> = approvedFamilies,
  timeoutMs = 30_000,
): Promise<SystemCommandResult> {
  const actor = currentActor();
  if (actor === "autonomous") {
    recordPerimeterIncident("forbidden-command-autonomous", `palier système tenté en autonome : ${command}`);
    return {
      ok: false, isError: true,
      text: "⚠ Palier système refusé : jamais accessible en contexte AUTONOME (fail-safe D4/D7), quel que soit le gate.",
    };
  }
  if (!flag("DESKTOP_SYSTEM_SHELL")) {
    return { ok: false, isError: true, text: "⚠ Palier système désactivé (gate DESKTOP_SYSTEM_SHELL off)." };
  }
  if (FORBIDDEN_RUN.test(command)) {
    return { ok: false, isError: true, text: `⚠ Commande interdite (plancher inviolable, FORBIDDEN_RUN) : ${command}` };
  }
  const family = matchFamily(command);
  if (!family) {
    return {
      ok: false, isError: true,
      text:
        `⚠ Commande hors des familles système connues — ce n'est PAS un shell libre. Familles disponibles : ` +
        `${SYSTEM_COMMAND_FAMILIES.map((f) => `${f.id} (${f.label})`).join(", ")}.`,
    };
  }
  if (needsApproval(family.id, approved)) {
    return {
      ok: false, isError: true,
      text: `⚠ Approbation requise pour la famille « ${family.label} » (${family.id}) — demande à Raf de l'approuver une fois pour cette session.`,
    };
  }
  const { code, out } = await runSystemCommand(command, timeoutMs);
  if (code !== 0) return { ok: false, isError: true, text: `exit ${code} — ${out.slice(-500).trim()}` };
  return { ok: true, text: `exit 0${out ? ` — ${out.slice(-500).trim()}` : ""}` };
}

// ── Outils déterministes (D5 : préférer l'outil nommé au shell libre) ───────────
//
// open_url fonctionne TOUJOURS (repli navigateur système via child_process, même hors
// coque Tauri — c'est un simple `start`/`open`/`xdg-open`, aucune dépendance native).
// open_folder / reveal_in_explorer NÉCESSITENT la coque desktop Tauri : le sidecar Rust
// pose `MANGOOS_DESKTOP_SHELL=1` dans l'environnement du process Node qu'il supervise
// (desktop/src-tauri/src/sidecar.rs) — c'est le SEUL signal fiable "on tourne dans la
// coque". Hors coque (npm run start / onglet navigateur) → erreur pédagogique claire,
// jamais un échec silencieux.

const IN_DESKTOP_SHELL = process.env.MANGOOS_DESKTOP_SHELL === "1";

function osOpenUrl(url: string): Promise<{ ok: boolean; out: string }> {
  return new Promise((resolve) => {
    const cmd =
      process.platform === "win32" ? `start "" "${url}"` :
      process.platform === "darwin" ? `open "${url}"` :
      `xdg-open "${url}"`;
    const proc = spawn(cmd, { shell: true, windowsHide: true });
    proc.on("error", (e) => resolve({ ok: false, out: (e as Error).message }));
    proc.on("exit", () => resolve({ ok: true, out: "" }));
  });
}

function osOpenFolder(folderPath: string): Promise<{ ok: boolean; out: string }> {
  return new Promise((resolve) => {
    const cmd =
      process.platform === "win32" ? `explorer "${folderPath}"` :
      process.platform === "darwin" ? `open "${folderPath}"` :
      `xdg-open "${folderPath}"`;
    const proc = spawn(cmd, { shell: true, windowsHide: true });
    // Note : explorer.exe renvoie fréquemment un code non-zéro même en cas de SUCCÈS
    // (quirk connu Windows) — on juge sur l'absence d'erreur de spawn, pas le code.
    proc.on("error", (e) => resolve({ ok: false, out: (e as Error).message }));
    proc.on("exit", () => resolve({ ok: true, out: "" }));
  });
}

function osRevealInExplorer(filePath: string): Promise<{ ok: boolean; out: string }> {
  return new Promise((resolve) => {
    const cmd =
      process.platform === "win32" ? `explorer /select,"${filePath}"` :
      process.platform === "darwin" ? `open -R "${filePath}"` :
      `xdg-open "${path.dirname(filePath)}"`;
    const proc = spawn(cmd, { shell: true, windowsHide: true });
    proc.on("error", (e) => resolve({ ok: false, out: (e as Error).message }));
    proc.on("exit", () => resolve({ ok: true, out: "" }));
  });
}

/** Registre des outils du palier système (#180 É6). Le CALLEUR (eleve-action-tools.ts)
 *  ne les enregistre QUE si `flag("DESKTOP_SYSTEM_SHELL")` est ON — gate OFF → cette
 *  fonction n'est même pas appelée, registre byte-identique à avant É6. */
export function buildEleveSystemTools(): KernelTool[] {
  return [
    {
      name: "run_system_command",
      description:
        "Exécute une commande SYSTÈME élargie (hors du strict build du projet), réservée à des FAMILLES nommées et approuvées par Raf une fois par session (ex. ouvrir VS Code). PAS un shell libre : hors des familles connues, ou famille pas encore approuvée → refus. Préfère open_folder/reveal_in_explorer/open_url quand ils suffisent (outils dédiés).",
      inputSchema: { command: z.string().describe("La commande système à exécuter") },
      handler: async (args): Promise<KernelToolResult> => {
        const r = await runSystemPaletteCommand(String(args.command ?? ""));
        return { text: r.text, isError: r.isError };
      },
    },
    {
      name: "open_url",
      description:
        "Ouvre une URL dans le navigateur par défaut du système. Marche même HORS coque desktop (repli navigateur classique).",
      inputSchema: { url: z.string().describe("URL absolue à ouvrir, ex. https://exemple.com") },
      handler: async (args): Promise<KernelToolResult> => {
        const actor = currentActor();
        if (actor === "autonomous") {
          recordPerimeterIncident("forbidden-command-autonomous", "open_url tenté en contexte autonome");
          return { text: "⚠ open_url refusé en contexte AUTONOME (fail-safe D4/D7) — jamais d'ouverture système hors supervision.", isError: true };
        }
        if (!flag("DESKTOP_SYSTEM_SHELL")) {
          return { text: "⚠ Palier système désactivé (gate DESKTOP_SYSTEM_SHELL off) — open_url indisponible.", isError: true };
        }
        const url = String(args.url ?? "").trim();
        if (!/^https?:\/\//i.test(url)) {
          return { text: "⚠ URL invalide (doit commencer par http:// ou https://).", isError: true };
        }
        const r = await osOpenUrl(url);
        return r.ok
          ? { text: `✓ URL envoyée au navigateur système : ${url}` }
          : { text: `⚠ Échec ouverture URL : ${r.out}`, isError: true };
      },
    },
    {
      name: "open_folder",
      description:
        "Ouvre un dossier dans l'explorateur de fichiers natif. NÉCESSITE la coque desktop Tauri (#180 É4) — hors coque, renvoie une erreur pédagogique claire (jamais un échec silencieux).",
      inputSchema: { path: z.string().describe("Chemin absolu du dossier à ouvrir") },
      handler: async (args): Promise<KernelToolResult> => {
        const actor = currentActor();
        if (actor === "autonomous") {
          recordPerimeterIncident("forbidden-command-autonomous", "open_folder tenté en contexte autonome");
          return { text: "⚠ open_folder refusé en contexte AUTONOME (fail-safe D4/D7).", isError: true };
        }
        if (!flag("DESKTOP_SYSTEM_SHELL")) {
          return { text: "⚠ Palier système désactivé (gate DESKTOP_SYSTEM_SHELL off) — open_folder indisponible.", isError: true };
        }
        if (!IN_DESKTOP_SHELL) {
          return {
            text: "⚠ open_folder nécessite la coque desktop Tauri (MangoOS lancé via l'app native) — indisponible en mode navigateur/serveur seul (npm run start).",
            isError: true,
          };
        }
        const p = String(args.path ?? "").trim();
        const r = await osOpenFolder(p);
        return r.ok ? { text: `✓ Dossier ouvert : ${p}` } : { text: `⚠ Échec ouverture dossier : ${r.out}`, isError: true };
      },
    },
    {
      name: "reveal_in_explorer",
      description:
        "Révèle/sélectionne un fichier dans l'explorateur de fichiers natif. NÉCESSITE la coque desktop Tauri (#180 É4).",
      inputSchema: { path: z.string().describe("Chemin absolu du fichier à révéler") },
      handler: async (args): Promise<KernelToolResult> => {
        const actor = currentActor();
        if (actor === "autonomous") {
          recordPerimeterIncident("forbidden-command-autonomous", "reveal_in_explorer tenté en contexte autonome");
          return { text: "⚠ reveal_in_explorer refusé en contexte AUTONOME (fail-safe D4/D7).", isError: true };
        }
        if (!flag("DESKTOP_SYSTEM_SHELL")) {
          return { text: "⚠ Palier système désactivé (gate DESKTOP_SYSTEM_SHELL off) — reveal_in_explorer indisponible.", isError: true };
        }
        if (!IN_DESKTOP_SHELL) {
          return {
            text: "⚠ reveal_in_explorer nécessite la coque desktop Tauri — indisponible en mode navigateur/serveur seul (npm run start).",
            isError: true,
          };
        }
        const p = String(args.path ?? "").trim();
        const r = await osRevealInExplorer(p);
        return r.ok ? { text: `✓ Fichier révélé dans l'explorateur : ${p}` } : { text: `⚠ Échec : ${r.out}`, isError: true };
      },
    },
  ];
}
