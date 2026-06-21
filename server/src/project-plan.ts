// #139 Mode « Gros Projet » — le manifest d'orchestration d'un gros projet unique.
//
// Source de vérité de la construction incrémentale : un squelette (socle-d'abord)
// puis une liste d'incréments (1 carte Kanban = 1 page/stage). Vit à la racine du
// projet (`.project-plan.json`), à côté de `.perfect-plan.json` / `.memory.md`.
// L'agent l'écrit (au scaffold) et le met à jour (en cochant un incrément) ; le
// backend le réconcilie après commit (garde-fou) et l'UI Kanban le lit/édite.
import fs from "node:fs";
import path from "node:path";

export type IncrementStatus = "todo" | "doing" | "done";
export type IncrementKind = "page" | "stage" | "feature";

export interface Increment {
  id: string; // slug stable (kebab-case du titre)
  kind: IncrementKind;
  title: string;
  route?: string;
  status: IncrementStatus;
  files?: string[];
  // Repli de cohérence MangoQA (flux-eye) après le delta — affiché en badge.
  qa?: { fluxMeasured: number; fluxConvergence: number; verdict?: string };
}

export interface ProjectPlan {
  createdAt: number;
  updatedAt: number;
  stack: "ts+rrv7";
  skeleton: { status: "todo" | "done"; files: string[] };
  increments: Increment[];
}

const FILE = ".project-plan.json";
const STATUSES = new Set<IncrementStatus>(["todo", "doing", "done"]);
const KINDS = new Set<IncrementKind>(["page", "stage", "feature"]);

function filePath(dir: string): string {
  return path.join(dir, FILE);
}

export function hasPlan(dir: string): boolean {
  return fs.existsSync(filePath(dir));
}

// Lecture DÉFENSIVE : un manifest écrit par l'agent peut être partiel/bruité.
// On ne lève jamais — un plan invalide est traité comme absent.
export function loadPlan(dir: string): ProjectPlan | null {
  try {
    const raw = JSON.parse(fs.readFileSync(filePath(dir), "utf8")) as unknown;
    return normalizePlan(raw);
  } catch {
    return null;
  }
}

export function normalizePlan(raw: unknown): ProjectPlan | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const skel = (o.skeleton ?? {}) as Record<string, unknown>;
  const incrementsRaw = Array.isArray(o.increments) ? o.increments : [];
  const increments: Increment[] = [];
  const seen = new Set<string>();
  for (const it of incrementsRaw) {
    const inc = normalizeIncrement(it);
    if (inc && !seen.has(inc.id)) {
      seen.add(inc.id);
      increments.push(inc);
    }
  }
  const now = Date.now();
  return {
    createdAt: typeof o.createdAt === "number" ? o.createdAt : now,
    updatedAt: typeof o.updatedAt === "number" ? o.updatedAt : now,
    stack: "ts+rrv7",
    skeleton: {
      status: skel.status === "done" ? "done" : "todo",
      files: Array.isArray(skel.files) ? skel.files.filter((f): f is string => typeof f === "string") : [],
    },
    increments,
  };
}

function normalizeIncrement(raw: unknown): Increment | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const title = typeof o.title === "string" ? o.title.trim() : "";
  if (!title) return null;
  const id = typeof o.id === "string" && o.id.trim() ? slugify(o.id) : slugify(title);
  if (!id) return null;
  return {
    id,
    kind: KINDS.has(o.kind as IncrementKind) ? (o.kind as IncrementKind) : "page",
    title,
    route: typeof o.route === "string" ? o.route : undefined,
    status: STATUSES.has(o.status as IncrementStatus) ? (o.status as IncrementStatus) : "todo",
    files: Array.isArray(o.files) ? o.files.filter((f): f is string => typeof f === "string") : undefined,
    qa: normalizeQa(o.qa),
  };
}

function normalizeQa(raw: unknown): Increment["qa"] {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  return {
    fluxMeasured: typeof o.fluxMeasured === "number" ? o.fluxMeasured : 0,
    fluxConvergence: typeof o.fluxConvergence === "number" ? o.fluxConvergence : 0,
    verdict: typeof o.verdict === "string" ? o.verdict : undefined,
  };
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function savePlan(dir: string, plan: ProjectPlan): void {
  fs.mkdirSync(dir, { recursive: true });
  const out: ProjectPlan = { ...plan, updatedAt: Date.now() };
  fs.writeFileSync(filePath(dir), JSON.stringify(out, null, 2), "utf8");
}

export function skeletonDone(dir: string): boolean {
  return loadPlan(dir)?.skeleton.status === "done";
}

/** Garde-fou backend après commit : marque l'incrément ciblé `done` + ses fichiers,
 * même si l'agent a oublié de cocher le manifest. No-op si pas de plan / id inconnu. */
export function markIncrementDone(dir: string, id: string, files: string[]): void {
  const plan = loadPlan(dir);
  if (!plan) return;
  const inc = plan.increments.find((i) => i.id === id);
  if (!inc) return;
  inc.status = "done";
  if (files.length) inc.files = files;
  savePlan(dir, plan);
}

/** Édition Kanban (PUT) : remplace la liste d'incréments (réordre/ajout/renommage).
 * Le squelette n'est jamais touché par cette voie. */
export function replaceIncrements(dir: string, increments: unknown): ProjectPlan | null {
  const plan = loadPlan(dir);
  if (!plan) return null;
  const next: Increment[] = [];
  const seen = new Set<string>();
  for (const it of Array.isArray(increments) ? increments : []) {
    const inc = normalizeIncrement(it);
    if (inc && !seen.has(inc.id)) {
      seen.add(inc.id);
      next.push(inc);
    }
  }
  plan.increments = next;
  savePlan(dir, plan);
  return plan;
}

/** Lit les observations de cohérence de l'Auditeur de Flux (MangoQA) si présentes,
 * pour les afficher en badge sur les cartes (lecture seule, fail-open). */
export function loadFluxCounts(dir: string): { fluxMeasured: number; fluxConvergence: number } | null {
  try {
    const p = path.join(dir, ".mangoqa", "flux-observations.json");
    const raw = JSON.parse(fs.readFileSync(p, "utf8")) as Record<string, unknown>;
    const counts = (raw.counts ?? {}) as Record<string, unknown>;
    const measured = typeof counts.measured === "number" ? counts.measured : undefined;
    const convergence = typeof counts.convergence === "number" ? counts.convergence : undefined;
    if (measured === undefined && convergence === undefined) return null;
    return { fluxMeasured: measured ?? 0, fluxConvergence: convergence ?? 0 };
  } catch {
    return null;
  }
}

// ── Blocs de prompt (Coque Souple) ─────────────────────────────────────────

/** Squelette-d'abord : injecté tant que le squelette n'est pas posé (mode projet). */
export const SCAFFOLD_RULES = `
Mode 🏗️ Gros Projet — PHASE SQUELETTE (le socle n'existe pas encore) : pose la FONDATION d'abord, en UN tour, puis STOP. Ce projet est UN seul produit (site multi-pages, jeu multi-stages), construit socle-d'abord puis un incrément borné par tour.
⛔ DEUX INTERDITS ABSOLUS ce tour-ci :
  (a) NE DÉLÈGUE PAS aux sous-agents builder — fais TOUT toi-même, sinon ces règles ne s'appliquent pas aux fichiers écrits.
  (b) NE CONSTRUIS PAS le contenu des pages — chaque page est un PLACEHOLDER (un titre + une phrase). Le vrai contenu viendra UN incrément par tour, plus tard.
Le socle, en TypeScript STRICT (jamais de .jsx) :
1. TypeScript OBLIGATOIRE : écris tsconfig.json (Vite gère TS nativement). TOUS les composants en .tsx, entrée src/main.tsx. Si le template fournit src/main.jsx / src/App.jsx, REMPLACE-les par leurs équivalents .tsx et SUPPRIME les .jsx. index.html doit pointer sur /src/main.tsx. Zéro fichier .jsx à la fin.
2. Routing : installe react-router-dom (v7), centralise les routes dans src/router.tsx (pages en lazy), enveloppées par un layout partagé src/layout/Root.tsx (header + nav qui lie CHAQUE page + footer + <Outlet/>). Chaque page du plan a une route ET un lien de nav — zéro route morte, zéro page orpheline.
3. Design system : src/theme/tokens.css (palette/typo dérivées du Perfect Plan ou de la description) en variables CSS, importé une fois dans main.tsx.
4. Modèle de données : src/types.ts avec les types du cœur ; un src/data/ (seed/store) si le produit a des données.
5. Pages PLACEHOLDER UNIQUEMENT : un .tsx minimal par page sous src/pages/ (ex. <main><h1>{titre}</h1><p>À construire</p></main>), déjà routé et navigable. PAS de hero, PAS de sections, PAS de contenu réel — juste de quoi compiler et naviguer.
6. Écris le manifest .project-plan.json à la racine :
   {"createdAt":<ms>,"updatedAt":<ms>,"stack":"ts+rrv7","skeleton":{"status":"done","files":["src/router.tsx", ...]},"increments":[{"id":"<slug>","kind":"page","title":"...","route":"/...","status":"todo"}]}
   Un incrément par page/stage à étoffer. Ids = slug kebab-case stable du titre. ⚠️ TOUS les incréments en "todo" (AUCUN "done" — rien n'est encore construit).
7. Garde l'app COMPILABLE (Vite HMR vert). Termine ton résumé en français en listant les pages du squelette (= le plan du chantier) et invite l'utilisateur à construire chaque page depuis le Kanban « Chantier ».`;

/** Posture du mode (toujours injectée via le bloc `mode`). */
export const PROJET_MODE_RULES = `
Mode 🏗️ Gros Projet — construction incrémentale d'UN grand produit, socle-d'abord puis incréments bornés :
- Le squelette (router, layout, tokens de design, modèle de données) est la source de vérité — RÉUTILISE-le, ne le reconstruis jamais.
- Travaille UN incrément à la fois (une seule page ou un seul stage de jeu). Ne touche qu'aux fichiers de cet incrément + le câblage partagé strictement nécessaire (un lien de nav, une route). Ne refactore pas tout l'app.
- Quand tu termines un incrément, marque-le "done" dans .project-plan.json (statut + liste de ses fichiers + updatedAt). Garde l'app compilable.
- Cohérence de navigation : chaque page atteignable depuis la nav partagée, zéro route morte, zéro page orpheline.`;

/** Bloc d'état du chantier : l'agent voit le board (fait / à faire) à chaque tour. "" si pas de plan. */
export function projectPlanSection(dir: string): string {
  const plan = loadPlan(dir);
  if (!plan) return "";
  const lines = [
    "",
    "## PLAN DU CHANTIER (.project-plan.json) — état de la construction",
    `Stack : ts+rrv7 · Squelette : ${plan.skeleton.status === "done" ? "posé ✅" : "à poser"}.`,
    "Incréments :",
  ];
  if (plan.increments.length === 0) {
    lines.push("- (aucun incrément listé — dérive-les du Perfect Plan / de la description)");
  } else {
    for (const inc of plan.increments) {
      const box = inc.status === "done" ? "[x]" : inc.status === "doing" ? "[~]" : "[ ]";
      lines.push(`- ${box} #${inc.id} — ${inc.title}${inc.route ? ` (${inc.route})` : ""} · ${inc.status}`);
    }
  }
  lines.push(
    "Construis l'incrément demandé par l'utilisateur (ou le prochain `todo` s'il dit « continue »). Mets à jour son statut dans .project-plan.json en fin de tour.",
  );
  return lines.join("\n");
}
