// Preuve déterministe de « L'armée automatique » (idée #73) : triggers purs
// (pattern matching fichiers + type), lecture bornée du delta, exécution d'un
// patrouilleur (RAS / throw avalés), agrégation (RAS masqués), bout-en-bout
// runPatrolOnce (injection dans l'historique), et changedFilesInLastCommit
// (root-commit + tour normal). Mock de `ask`, fs en tmpdir, zéro réseau LLM.
//
// Lancer :  npx tsx src/test-patrol.ts

import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  PATROLLERS,
  buildPatrolContext,
  runPatroller,
  aggregatePatrol,
  runPatrolOnce,
  type PatrolContext,
  type PatrolFinding,
  type PatrolDeps,
} from "../patrol.js";
import { changedFilesInLastCommit } from "../versions.js";
import type { ProjectType } from "../blueprints.js";

let failures = 0;
const check = (label: string, cond: boolean) => {
  console.log(`  ${cond ? "✓" : "✗"} ${label}`);
  if (!cond) failures++;
};
const line = (c = "─") => console.log(c.repeat(64));

const get = (id: string) => {
  const p = PATROLLERS.find((x) => x.id === id);
  if (!p) throw new Error(`patrouilleur ${id} introuvable`);
  return p;
};
const mkCtx = (
  changedFiles: string[],
  projectType: ProjectType,
  contents: Record<string, string> = {},
): PatrolContext => ({
  projectDir: path.join(os.tmpdir(), "patrol-x"),
  projectType,
  changedFiles,
  fileContents: new Map(Object.entries(contents)),
});

line("═");
console.log("patrol — L'armée automatique (#73)");
line();

// 1) Triggers purs ───────────────────────────────────────────────────────────
console.log("Triggers :");
check("a11y déclenché sur un .jsx d'une webapp", get("a11y").triggers(mkCtx(["src/App.jsx"], "webapp")));
check("a11y NON déclenché sans fichier UI", !get("a11y").triggers(mkCtx(["server/db.ts"], "agent")));
check("a11y NON déclenché sur type 'autre'", !get("a11y").triggers(mkCtx(["src/App.jsx"], "autre")));

check("security déclenché sur server/api/routes.ts", get("security").triggers(mkCtx(["server/api/routes.ts"], "webapp")));
check("security déclenché sur .env", get("security").triggers(mkCtx([".env"], "vitrine")));
check(
  "security déclenché par contenu sensible (dangerouslySetInnerHTML)",
  get("security").triggers(mkCtx(["src/Note.jsx"], "webapp", { "src/Note.jsx": "<div dangerouslySetInnerHTML={{__html:x}}/>" })),
);
check(
  "security NON déclenché sur une UI vitrine anodine",
  !get("security").triggers(mkCtx(["src/Hero.jsx"], "vitrine", { "src/Hero.jsx": "export default ()=><h1>Bonjour</h1>" })),
);

check("seo déclenché sur index.html (vitrine)", get("seo").triggers(mkCtx(["index.html"], "vitrine")));
check("seo NON déclenché sur un jeu", !get("seo").triggers(mkCtx(["src/Game.jsx"], "jeu")));

check("perf déclenché sur un .jsx (webapp)", get("perf").triggers(mkCtx(["src/App.jsx"], "webapp")));
check("perf NON déclenché sur des slides", !get("perf").triggers(mkCtx(["src/Deck.jsx"], "slides")));

check("bundle déclenché quand package.json change", get("bundle").triggers(mkCtx(["package.json"], "webapp")));
check(
  "bundle déclenché par un import de package node_modules",
  get("bundle").triggers(mkCtx(["src/App.jsx"], "webapp", { "src/App.jsx": "import * as THREE from 'three'" })),
);
check(
  "bundle NON déclenché sur un import relatif seul",
  !get("bundle").triggers(mkCtx(["src/App.jsx"], "webapp", { "src/App.jsx": "import x from './utils'" })),
);

// 2) buildPatrolContext : lecture bornée ──────────────────────────────────────
line();
console.log("buildPatrolContext :");
const proj = fs.mkdtempSync(path.join(os.tmpdir(), "patrol-ctx-"));
fs.mkdirSync(path.join(proj, "src"), { recursive: true });
fs.writeFileSync(path.join(proj, "src", "small.jsx"), "export default ()=><div/>", "utf8");
fs.writeFileSync(path.join(proj, "src", "big.jsx"), "x".repeat(5000), "utf8");
const ctx = buildPatrolContext(proj, "webapp", ["src/small.jsx", "src/big.jsx", "src/ghost.jsx"]);
check("fichier lisible présent dans le contexte", ctx.fileContents.get("src/small.jsx")?.includes("export default") ?? false);
check("gros fichier tronqué", ctx.fileContents.get("src/big.jsx")?.endsWith("…(tronqué)") ?? false);
check("fichier inexistant sauté du contenu", !ctx.fileContents.has("src/ghost.jsx"));
check("mais conservé dans changedFiles (trigger par nom)", ctx.changedFiles.includes("src/ghost.jsx"));

// 3) runPatroller : RAS / rapport / throw ─────────────────────────────────────
line();
console.log("runPatroller :");
const okDeps: PatrolDeps = { ask: async () => "- bouton sans aria-label — Header.jsx — ajouter aria-label" };
const rasDeps: PatrolDeps = { ask: async () => "RAS" };
const boomDeps: PatrolDeps = { ask: async () => { throw new Error("LLM down"); } };
const c = buildPatrolContext(proj, "webapp", ["src/small.jsx"]);
const fOk = await runPatroller(get("a11y"), c, okDeps);
const fRas = await runPatroller(get("a11y"), c, rasDeps);
const fBoom = await runPatroller(get("a11y"), c, boomDeps);
check("rapport → finding non clean", !fOk.clean && fOk.report.includes("aria-label"));
check("'RAS' → finding clean", fRas.clean);
check("throw → finding clean, report vide", fBoom.clean && fBoom.report === "");

// 4) aggregatePatrol : RAS masqués ────────────────────────────────────────────
line();
console.log("aggregatePatrol :");
const allClean: PatrolFinding[] = [
  { id: "a11y", label: "Accessibilité", emoji: "♿", report: "", clean: true },
  { id: "perf", label: "Performance", emoji: "⚡", report: "", clean: true },
];
check("tout RAS → aucun message (null)", aggregatePatrol(allClean) === null);
const mixed: PatrolFinding[] = [
  { id: "a11y", label: "Accessibilité", emoji: "♿", report: "rien", clean: true },
  { id: "security", label: "Sécurité", emoji: "🔒", report: "- (haute) clé en dur", clean: false },
];
const agg = aggregatePatrol(mixed) ?? "";
check("agrégat porte l'entête 🛡️ et le compte (1/2)", agg.includes("🛡️") && agg.includes("(1/2)"));
check("agrégat inclut le patrouilleur signalant", agg.includes("Sécurité") && agg.includes("clé en dur"));
check("agrégat masque le patrouilleur propre", !agg.includes("Accessibilité"));

// 5) runPatrolOnce : bout-en-bout, injection dans l'historique ─────────────────
line();
console.log("runPatrolOnce :");
const proj2 = fs.mkdtempSync(path.join(os.tmpdir(), "patrol-run-"));
fs.mkdirSync(path.join(proj2, "src"), { recursive: true });
fs.writeFileSync(path.join(proj2, "src", "App.jsx"), "export default function App(){return <div onClick={f}/>}", "utf8");
const histFile = path.join(proj2, ".chat-history.json");

const resRas = await runPatrolOnce(proj2, "webapp", ["src/App.jsx"], rasDeps);
check("tout RAS → runPatrolOnce renvoie null", resRas === null);
check("tout RAS → pas d'historique écrit", !fs.existsSync(histFile));

const resFlag = await runPatrolOnce(proj2, "webapp", ["src/App.jsx"], okDeps);
check("alerte → message 🛡️ renvoyé", (resFlag ?? "").includes("🛡️"));
const hist = fs.existsSync(histFile) ? JSON.parse(fs.readFileSync(histFile, "utf8")) : [];
check("alerte → une ligne status 🛡️ dans l'historique", Array.isArray(hist) && hist.some((e: { role: string; text: string }) => e.role === "status" && e.text.includes("🛡️")));

const resEmpty = await runPatrolOnce(proj2, "autre", [], okDeps);
check("aucun patrouilleur déclenché → null", resEmpty === null);

// 6) changedFilesInLastCommit : root-commit + tour normal ──────────────────────
line();
console.log("changedFilesInLastCommit :");
const repo = fs.mkdtempSync(path.join(os.tmpdir(), "patrol-git-"));
const g = (...args: string[]) => execFileSync("git", ["-c", "user.name=T", "-c", "user.email=t@t.io", ...args], { cwd: repo });
check("hors repo → tableau vide", (await changedFilesInLastCommit(path.join(repo, "nope"))).length === 0);
g("init");
fs.writeFileSync(path.join(repo, "a.txt"), "1", "utf8");
fs.writeFileSync(path.join(repo, "b.txt"), "1", "utf8");
g("add", "-A");
g("commit", "-m", "init");
const root = await changedFilesInLastCommit(repo);
check("root-commit (fallback git show) → liste les fichiers", root.includes("a.txt") && root.includes("b.txt"));
fs.writeFileSync(path.join(repo, "a.txt"), "2", "utf8");
g("add", "-A");
g("commit", "-m", "edit a");
const delta = await changedFilesInLastCommit(repo);
check("tour normal (diff HEAD~1 HEAD) → seul le fichier modifié", delta.length === 1 && delta[0] === "a.txt");

// ── Bilan ─────────────────────────────────────────────────────────────────────
line("═");
if (failures === 0) {
  console.log("✅ patrol — toutes les assertions vertes");
} else {
  console.log(`❌ patrol — ${failures} assertion(s) en échec`);
  process.exitCode = 1;
}
