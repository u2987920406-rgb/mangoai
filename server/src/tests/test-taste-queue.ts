// Tests de la file d'attente des runs de goût (taste-queue.ts) — fs EN MÉMOIRE, horloge
// injectée → déterministe, zéro disque.

import {
  loadRuns, saveRuns, enqueueRun, getRun, listPending, decideRun, pruneOld, genRunId,
  type TasteRun, type QueueDeps,
} from "../taste/taste-queue.js";
import type { SkinRender } from "../taste/taste-render.js";

let pass = 0, fail = 0;
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

// ── fs en mémoire + horloge contrôlée ──
const FILE = "mem://taste-queue.json";
let clock = Date.parse("2026-06-24T08:00:00Z");
function makeDeps(): { deps: QueueDeps; store: Map<string, string> } {
  const store = new Map<string, string>();
  const deps: QueueDeps = {
    readFileSync: (p) => { if (!store.has(p)) throw new Error("ENOENT"); return store.get(p)!; },
    writeFileSync: (p, data) => { store.set(p, data); },
    mkdirSync: () => {},
    now: () => clock,
  };
  return { deps, store };
}

function skin(id: string, over: Partial<SkinRender> = {}): SkinRender {
  return { id, name: id, ok: true, palette: [], file: `${id}.jpg`, ...over };
}
function run(id: string, over: Partial<TasteRun> = {}): TasteRun {
  return {
    id, project: "mango-cafe-ts", maille: "hero", createdAt: new Date(clock).toISOString(),
    status: "pending", skins: [skin("a", { recommended: true, score: 90 }), skin("b", { score: 80 })], ...over,
  };
}

// ── vide au départ ──
{
  const { deps } = makeDeps();
  check("loadRuns vide si fichier absent", loadRuns(FILE, deps).length === 0);
  check("listPending vide si fichier absent", listPending(FILE, deps).length === 0);
}

// ── enqueue + get + ordre (plus récent d'abord) ──
{
  const { deps } = makeDeps();
  enqueueRun(run("r1"), FILE, deps);
  enqueueRun(run("r2"), FILE, deps);
  const all = loadRuns(FILE, deps);
  check("enqueue empile en tête (r2 avant r1)", all.length === 2 && all[0].id === "r2" && all[1].id === "r1");
  check("getRun retrouve par id", getRun("r1", FILE, deps)?.id === "r1");
  check("getRun → undefined si inconnu", getRun("nope", FILE, deps) === undefined);
}

// ── listPending allégé + recommandé en tête ──
{
  const { deps } = makeDeps();
  enqueueRun(run("r1"), FILE, deps);
  const sums = listPending(FILE, deps);
  check("listPending renvoie une vue allégée", sums.length === 1 && sums[0].count === 2);
  check("listPending expose le recommandé", sums[0].recommendedId === "a" && sums[0].recommendedScore === 90);
}

// ── decideRun : succès, idempotence, garde-fous ──
{
  const { deps } = makeDeps();
  enqueueRun(run("r1"), FILE, deps);
  const d1 = decideRun("r1", "b", "trop froid", FILE, deps);
  check("decideRun ok sur un skin valide", d1.ok && d1.run?.status === "decided" && d1.run?.chosenId === "b");
  check("decideRun horodate la décision", !!d1.run?.decidedAt);
  check("le run décidé sort des pending", listPending(FILE, deps).length === 0);
  const d2 = decideRun("r1", "a", undefined, FILE, deps);
  check("decideRun idempotent (already-decided)", !d2.ok && d2.reason === "already-decided");
  const d3 = decideRun("absent", "a", undefined, FILE, deps);
  check("decideRun not-found si run inconnu", !d3.ok && d3.reason === "not-found");
  const { deps: d2deps } = makeDeps();
  enqueueRun(run("r2"), FILE, d2deps);
  const d4 = decideRun("r2", "zzz", undefined, FILE, d2deps);
  check("decideRun unknown-skin si id absent du run", !d4.ok && d4.reason === "unknown-skin");
}

// ── pruneOld : garde les pending, retire les vieux décidés ──
{
  const { deps } = makeDeps();
  enqueueRun(run("old", { status: "decided", decidedAt: new Date(clock - 10 * 86400000).toISOString() }), FILE, deps);
  enqueueRun(run("recent", { status: "decided", decidedAt: new Date(clock).toISOString() }), FILE, deps);
  enqueueRun(run("pend", { status: "pending" }), FILE, deps);
  const removed = pruneOld(7, FILE, deps);
  const left = loadRuns(FILE, deps).map((r) => r.id).sort();
  check("pruneOld retire 1 vieux décidé", removed === 1);
  check("pruneOld garde le pending + le récent", JSON.stringify(left) === JSON.stringify(["pend", "recent"]));
}

// ── genRunId déterministe-ish (préfixe horloge) ──
check("genRunId produit une chaîne non vide", genRunId(() => clock).length >= 6);

console.log(`\n${pass} pass / ${fail} fail`);
if (fail > 0) process.exit(1);
