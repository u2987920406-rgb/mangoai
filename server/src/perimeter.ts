// #180 É1 — Noyau de périmètre PUR (la brique de sûreté centrale du chantier
// « interface de bureau autonome »). Voir docs/plan-180-interface-autonome.md,
// décisions D3 (coffres consentis) et D4 (le périmètre suit le pilote).
//
// Deux couches strictement séparées, comme le reste du repo :
//   • DÉCISION (pure, zéro I/O) : resolveInsideAny + resolvePerimeter. Aucune
//     lecture disque, aucun process.env lu ici — les 3 flags de la précondition
//     D4 sont INJECTÉS (PerimeterFlags), donc testables sans muter l'env.
//   • I/O (impure, injectable) : le registre de grants persisté
//     (data/desktop-grants.json), écriture ATOMIQUE (atomicWriteFileSync), file
//     injectable pour les tests.
//
// Mode d'échec = FAIL-SAFE (D4/§1.4) : c'est un gate de POUVOIR, pas de qualité.
// Dans le DOUTE (garde-fou absent, grant illisible, chemin ambigu) on REDESCEND
// au workspace. On n'élargit un pouvoir d'action que « fermé par défaut ».

import fs from "node:fs";
import path from "node:path";
import { atomicWriteFileSync, dataDir } from "./safe-io.js";
import { flag } from "./flags.js";

// ── Modèle ──────────────────────────────────────────────────────────────────

/** Mode d'accès à une racine consentie. `ro` = lecture seule, `rw` = lecture+écriture. */
export type GrantMode = "ro" | "rw";

/** Un COFFRE consenti par Raf : un dossier hors-workspace explicitement granté
 *  (via le picker natif de D2), en plus du workspace par défaut. */
export interface Grant {
  /** Chemin ABSOLU normalisé du dossier granté. */
  path: string;
  /** Droit accordé sur ce coffre. */
  mode: GrantMode;
  /** Horodatage (ms epoch) de l'octroi — trace du geste de consentement. */
  ts: number;
}

/** Qui agit — c'est l'axe de D4. `interactive` = Raf présent (chat) ; `autonomous`
 *  = nuit/cron/Stratège/tuteur, personne à l'écran. */
export type Actor = "interactive" | "autonomous";

/** Une racine du périmètre effectif : un dossier légitime + le droit qui s'y applique. */
export interface RootAccess {
  path: string;
  mode: GrantMode;
}

/** Le périmètre EFFECTIF résolu pour un acteur donné. */
export interface Perimeter {
  actor: Actor;
  /** Racines légitimes (workspace + coffres retenus), chacune avec son droit. */
  roots: RootAccess[];
  /** Vrai si le périmètre a été RESTREINT par le fail-safe (précondition D4 non
   *  satisfaite en autonome) → workspace-only alors que des coffres existaient. */
  downgraded: boolean;
  /** Explication courte du palier retenu (audit/log au boot d'un run). */
  reason: string;
}

/** Les 3 garde-fous de la revue globale dont l'activation EFFECTIVE conditionne
 *  le périmètre large autonome (D4). Injectés → décision pure et testable. */
export interface PerimeterFlags {
  /** MANGOQA_STOP_AUTHORITY — l'autorité d'arrêt réelle du Disjoncteur. */
  stopAuthority: boolean;
  /** NOCTURNAL_BUDGET_HARD — le budget-$ dur partagé, armé. */
  budgetHard: boolean;
  /** NOCTURNAL_QA_BUS — la boucle nocturne observable (émet chat.turn/phase-complete). */
  qaBus: boolean;
}

// ── Confinement de chemin (généralisation de resolveInside) ─────────────────

/**
 * Généralisation de `resolveInside(root, rel)` (dupliqué ~8× dans le repo) à une
 * UNION de racines consenties. Un chemin est accepté s'il tombe sous AU MOINS
 * une racine — mais le test EXACT d'aujourd'hui (`abs === root ||
 * abs.startsWith(root + sep)`) s'applique à CHAQUE racine séparément : la
 * traversée `../` reste bloquée dans chaque coffre, on n'élargit QUE l'ensemble
 * des racines légitimes, jamais le mécanisme de défense.
 *
 * NON-RÉGRESSION : avec un seul root déjà normalisé (le cas actuel sans coffres),
 * `resolveInsideAny([root], rel)` est byte-identique à `resolveInside(root, rel)`
 * — même `path.resolve(root, rel)`, même prédicat, même valeur retournée.
 *
 * PUR : aucune I/O, ne consulte pas le disque (n'exige pas que le chemin existe).
 * FAIL-SAFE : lève si le chemin ne tombe sous AUCUNE racine (jamais silencieux).
 */
export function resolveInsideAny(roots: readonly string[], rel: string): string {
  for (const root of roots) {
    // Racine normalisée à l'absolu (comme executor.resolveInside fait
    // path.resolve(projectDir) d'abord) → séparateurs cohérents cross-OS.
    const base = path.resolve(root);
    const abs = path.resolve(base, rel);
    if (abs === base || abs.startsWith(base + path.sep)) return abs;
  }
  throw new Error(`chemin hors du périmètre : ${rel}`);
}

// ── Résolution du palier — LE cœur de D4 ────────────────────────────────────

/** Lit les 3 flags depuis l'environnement central. Seul point (optionnel) où le
 *  module TOUCHE process.env — via `flag()`. Les fonctions de décision, elles,
 *  reçoivent le résultat en argument (restent pures). */
export function readPerimeterFlags(): PerimeterFlags {
  return {
    stopAuthority: flag("MANGOQA_STOP_AUTHORITY"),
    budgetHard: flag("NOCTURNAL_BUDGET_HARD"),
    qaBus: flag("NOCTURNAL_QA_BUS"),
  };
}

/**
 * Résout le périmètre EFFECTIF selon l'ACTEUR (D4 — « le périmètre suit le pilote »).
 *
 * PUR : `flags` et `grants` sont injectés, aucune I/O.
 *
 *   • interactive : workspace (rw) + TOUS les coffres grantés, chacun à SON mode
 *     (ro/rw). Raf est dans la boucle, il peut arrêter d'un clic.
 *   • autonomous  : workspace (rw) + coffres en LECTURE SEULE (ro), et UNIQUEMENT
 *     si la PRÉCONDITION DURE est satisfaite — les 3 flags TOUS actifs
 *     (stopAuthority ET budgetHard ET qaBus). Si l'un manque → FAIL-SAFE :
 *     workspace-only, comportement historique, `downgraded:true`.
 *
 * C'est littéralement ici que « périmètre élargi CONTRÔLÉ » cesse d'être une
 * promesse de doc : on ne donne pas plus de pouvoir à la partie non supervisée
 * sans la preuve, à chaque résolution, que son frein (arrêt), sa borne (budget)
 * et son œil (QA bus) sont branchés.
 */
export function resolvePerimeter(
  actor: Actor,
  opts: { workspace: string; grants: readonly Grant[]; flags: PerimeterFlags },
): Perimeter {
  const workspace = path.resolve(opts.workspace);
  const wsRoot: RootAccess = { path: workspace, mode: "rw" };

  if (actor === "interactive") {
    // Palier large : chaque coffre à son mode déclaré.
    const roots = [wsRoot, ...opts.grants.map((g) => ({ path: path.resolve(g.path), mode: g.mode }))];
    return {
      actor,
      roots,
      downgraded: false,
      reason: `interactif : workspace + ${opts.grants.length} coffre(s) au mode granté`,
    };
  }

  // actor === "autonomous" — la précondition dure de D4.
  const { stopAuthority, budgetHard, qaBus } = opts.flags;
  const armed = stopAuthority && budgetHard && qaBus;

  if (!armed) {
    // FAIL-SAFE : au moins un garde-fou manque → aucun coffre, même granté.
    const missing = [
      !stopAuthority && "MANGOQA_STOP_AUTHORITY",
      !budgetHard && "NOCTURNAL_BUDGET_HARD",
      !qaBus && "NOCTURNAL_QA_BUS",
    ].filter(Boolean).join(", ");
    return {
      actor,
      roots: [wsRoot],
      downgraded: opts.grants.length > 0,
      reason: `autonome fail-safe → workspace-only (garde-fou(s) absent(s) : ${missing})`,
    };
  }

  // Précondition satisfaite : coffres accessibles, mais en LECTURE SEULE au mieux
  // (un mode `rw` granté est rabaissé à `ro` en autonome — D4).
  const roots = [wsRoot, ...opts.grants.map((g) => ({ path: path.resolve(g.path), mode: "ro" as GrantMode }))];
  return {
    actor,
    roots,
    downgraded: false,
    reason: `autonome armé (3/3 garde-fous) : workspace rw + ${opts.grants.length} coffre(s) en ro`,
  };
}

/**
 * Extrait les racines exploitables par `resolveInsideAny`, filtrées par le type
 * d'accès. Un `write` ne retient QUE les racines `rw` (un coffre `ro` interdit
 * l'écriture même s'il est lisible) ; un `read` retient toutes les racines.
 * C'est le pont que le branchement É2 utilisera :
 *   resolveInsideAny(perimeterRoots(p, 'write'), rel)  → confinement d'écriture.
 */
export function perimeterRoots(p: Perimeter, access: "read" | "write" = "read"): string[] {
  return p.roots.filter((r) => access === "read" || r.mode === "rw").map((r) => r.path);
}

// ── Registre de grants — couche PURE ────────────────────────────────────────

/** Normalise un chemin de grant (absolu, séparateurs OS cohérents). */
function normGrantPath(p: string): string {
  return path.resolve(p);
}

/**
 * Ajoute (ou MET À JOUR) un coffre. PUR : renvoie un NOUVEAU tableau, ne mute
 * pas l'entrée. Un même dossier re-granté remplace son mode/horodatage (pas de
 * doublon) — le dernier geste de consentement fait foi.
 */
export function addGrant(grants: readonly Grant[], p: string, mode: GrantMode, ts: number = Date.now()): Grant[] {
  const abs = normGrantPath(p);
  const rest = grants.filter((g) => normGrantPath(g.path) !== abs);
  return [...rest, { path: abs, mode, ts }];
}

/** Révoque un coffre (par chemin, normalisé). PUR : renvoie un nouveau tableau. */
export function revokeGrant(grants: readonly Grant[], p: string): Grant[] {
  const abs = normGrantPath(p);
  return grants.filter((g) => normGrantPath(g.path) !== abs);
}

/**
 * Liste défensive des grants VALIDES. PUR. Filtre les entrées corrompues
 * (fail-safe : un grant illisible ne doit pas ouvrir un accès — il est ignoré,
 * jamais interprété au bénéfice du doute). Normalise les chemins.
 */
export function listGrants(grants: readonly unknown[]): Grant[] {
  const out: Grant[] = [];
  for (const g of grants) {
    if (!g || typeof g !== "object") continue;
    const o = g as Record<string, unknown>;
    if (typeof o.path !== "string" || o.path.length === 0) continue;
    if (o.mode !== "ro" && o.mode !== "rw") continue;
    const ts = typeof o.ts === "number" && Number.isFinite(o.ts) ? o.ts : 0;
    out.push({ path: normGrantPath(o.path), mode: o.mode, ts });
  }
  return out;
}

// ── Registre de grants — couche I/O (impure, injectable) ────────────────────

const DATA_DIR = dataDir();
export const GRANTS_FILE = path.join(DATA_DIR, "desktop-grants.json");

/**
 * Lecture FAIL-SAFE du registre. `file` injectable pour les tests. Absent /
 * illisible / JSON invalide → [] (aucun coffre : on redescend au workspace, on
 * n'ouvre jamais un accès sur un fichier douteux). Les entrées corrompues d'un
 * fichier par ailleurs lisible sont écartées par `listGrants`.
 */
export function loadGrants(file: string = GRANTS_FILE): Grant[] {
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
    if (!Array.isArray(raw)) return [];
    return listGrants(raw);
  } catch {
    return [];
  }
}

/** Écriture ATOMIQUE (tmp+rename via safe-io) du registre. `file` injectable. */
export function saveGrants(grants: readonly Grant[], file: string = GRANTS_FILE): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  atomicWriteFileSync(file, JSON.stringify(grants, null, 2));
}

/** Convenance I/O : ajoute un coffre et persiste. Renvoie le nouvel état. */
export function addGrantToFile(p: string, mode: GrantMode, file: string = GRANTS_FILE, ts: number = Date.now()): Grant[] {
  const next = addGrant(loadGrants(file), p, mode, ts);
  saveGrants(next, file);
  return next;
}

/** Convenance I/O : révoque un coffre et persiste. Renvoie le nouvel état. */
export function revokeGrantFromFile(p: string, file: string = GRANTS_FILE): Grant[] {
  const next = revokeGrant(loadGrants(file), p);
  saveGrants(next, file);
  return next;
}
