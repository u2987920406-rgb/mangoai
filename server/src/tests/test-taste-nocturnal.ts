// Tests de la curation nocturne (taste-nocturnal.ts) — génération/juge/notif INJECTÉS,
// zéro réseau, zéro navigateur, zéro disque pour la file (enqueue capturé).

import {
  selectEligibleProjects, enqueueTasteRun, runNocturnalTasteBatch,
  DEFAULT_TASTE_NOCTURNAL_CONFIG,
  type SelectDeps, type EnqueueTasteDeps, type BatchDeps, type TasteNocturnalConfig,
} from "../taste/taste-nocturnal.js";
import type { SkinRender } from "../taste/taste-render.js";
import type { TasteRun } from "../taste/taste-queue.js";

let pass = 0, fail = 0;
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

// ── selectEligibleProjects ──
{
  const tokens = new Set(["app-a", "app-b", "app-c"]); // no-tokens n'a PAS de tokens.css
  const heroes = new Set(["app-a", "app-c"]);
  const mt: Record<string, number> = { "app-a": 300, "app-b": 200, "app-c": 100, "no-tokens": 999, "nuit-x-1": 999 };
  const deps: SelectDeps = {
    listProjects: () => ["app-a", "app-b", "app-c", "no-tokens", "nuit-x-1"],
    dirOf: (p) => p,
    hasTokens: (d) => tokens.has(d),
    hasHero: (d) => heroes.has(d),
    mtime: (d) => mt[d] ?? 0,
  };
  const hero = selectEligibleProjects(5, "hero", deps);
  check("hero : garde uniquement tokens+hero, hors nuit-*", JSON.stringify(hero) === JSON.stringify(["app-a", "app-c"]));
  const skin = selectEligibleProjects(5, "skin", deps);
  check("skin : garde tokens (hero non requis), exclut no-tokens si absent de tokens", JSON.stringify(skin) === JSON.stringify(["app-a", "app-b", "app-c"]));
  check("tri par mtime décroissant", selectEligibleProjects(1, "skin", deps)[0] === "app-a");
  check("plafond respecté", selectEligibleProjects(2, "skin", deps).length === 2);
  check("exclut les brouillons nuit-*", !hero.includes("nuit-x-1"));
}

// ── enqueueTasteRun ──
function fakeSkins(...ids: string[]): SkinRender[] {
  return ids.map((id, i) => ({ id, name: id, ok: true, palette: [], file: `${id}.jpg`, score: 90 - i }));
}
function enqueueDeps(over: Partial<EnqueueTasteDeps> = {}): { deps: EnqueueTasteDeps; enqueued: TasteRun[] } {
  const enqueued: TasteRun[] = [];
  const deps: EnqueueTasteDeps = {
    generate: async () => fakeSkins("a", "b"),
    judge: async (_dir, skins) => { skins.forEach((s, i) => { if (i === 0) s.recommended = true; }); return skins; },
    buildCtx: () => ({ tasteAxioms: "", designSystem: "" }),
    enqueue: (run) => { enqueued.push(run); return run; },
    favoredIds: () => [],
    now: () => Date.parse("2026-06-24T03:00:00Z"),
    ...over,
  };
  return { deps, enqueued };
}
{
  const h = enqueueDeps();
  const run = await enqueueTasteRun("app-a", { maille: "hero", k: 2 }, h.deps);
  check("enqueueTasteRun renvoie un run pending", run?.status === "pending" && run?.project === "app-a");
  check("enqueueTasteRun enfile le run", h.enqueued.length === 1 && h.enqueued[0].skins.length === 2);
  check("enqueueTasteRun fait juger les skins", h.enqueued[0].skins[0].recommended === true);
  check("run porte la maille", run?.maille === "hero");
}
{
  // génération qui throw → null, pas de crash, rien enfilé
  const h = enqueueDeps({ generate: async () => { throw new Error("vite down"); } });
  const run = await enqueueTasteRun("app-a", { maille: "hero", k: 2 }, h.deps);
  check("génération qui throw → null sans crash", run === null && h.enqueued.length === 0);
}
{
  // aucune variante exploitable → null
  const h = enqueueDeps({ generate: async () => [{ id: "x", name: "x", ok: false, palette: [] }] });
  const run = await enqueueTasteRun("app-a", { maille: "hero", k: 2 }, h.deps);
  check("zéro variante ok → null", run === null && h.enqueued.length === 0);
}
{
  // juge qui throw → run quand même enfilé (non bloquant)
  const h = enqueueDeps({ judge: async () => { throw new Error("VL down"); } });
  const run = await enqueueTasteRun("app-a", { maille: "skin", k: 2 }, h.deps);
  check("juge qui throw → run enfilé quand même", run !== null && h.enqueued.length === 1);
}
{
  // boucle fermée : les favoris sont transmis à generate
  let seenFavor: string[] | undefined;
  const h = enqueueDeps({
    favoredIds: () => ["carte-flottante"],
    generate: async (_dir, o) => { seenFavor = o.favorIds; return fakeSkins("a", "b"); },
  });
  await enqueueTasteRun("app-a", { maille: "hero", k: 2 }, h.deps);
  check("boucle fermée : favoredIds transmis à generate", JSON.stringify(seenFavor) === JSON.stringify(["carte-flottante"]));
}

// ── runNocturnalTasteBatch ──
function batchDeps(over: Partial<BatchDeps> = {}): { deps: BatchDeps; notifs: Array<{ topic?: string }>; runs: string[] } {
  const notifs: Array<{ topic?: string }> = [];
  const runs: string[] = [];
  const deps: BatchDeps = {
    select: () => ["app-a", "app-b"],
    enqueueRun: async (project) => { runs.push(project); return { id: project, project, maille: "hero", createdAt: "", status: "pending", skins: fakeSkins("a") }; },
    notify: async (topic) => { notifs.push({ topic }); return { sent: !!topic }; },
    pending: () => runs.length,
    baseUrl: () => "http://192.168.1.5:3000",
    ...over,
  };
  return { deps, notifs, runs };
}
const cfg: TasteNocturnalConfig = { ...DEFAULT_TASTE_NOCTURNAL_CONFIG, count: 2, maille: "hero", k: 3, ntfyTopic: "mango-raf" };
{
  const b = batchDeps();
  const res = await runNocturnalTasteBatch(cfg, b.deps);
  check("batch génère 1 run par projet sélectionné", res.generated === 2 && b.runs.length === 2);
  check("batch notifie quand il y a des pending", res.notified === true && b.notifs.length === 1 && b.notifs[0].topic === "mango-raf");
}
{
  // topic vide → notify no-op (sent:false), pas d'erreur
  const b = batchDeps();
  const res = await runNocturnalTasteBatch({ ...cfg, ntfyTopic: "" }, b.deps);
  check("topic vide → notified false", res.notified === false);
}
{
  // aucun projet éligible → rien, pas de notif
  const b = batchDeps({ select: () => [] });
  const res = await runNocturnalTasteBatch(cfg, b.deps);
  check("zéro projet → generated 0, pas de notif", res.generated === 0 && b.notifs.length === 0);
}

console.log(`\n${pass} pass / ${fail} fail`);
if (fail > 0) process.exit(1);
