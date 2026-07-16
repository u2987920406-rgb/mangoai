// Tests du moteur de workflow (eleve-workflow.ts) — tri topologique en niveaux
// + exécution via delegate injecté. Zéro réseau, déterministe.
import { topoSortLevels, runWorkflow, type WorkflowDef, type DelegateFn } from "../stratege/eleve-workflow.js";

let pass = 0, fail = 0;
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

console.log("[1] topoSortLevels — graphe linéaire A→B→C");
{
  const def: WorkflowDef = {
    nodes: [
      { id: "A", task: "a" },
      { id: "B", task: "b", dependsOn: ["A"] },
      { id: "C", task: "c", dependsOn: ["B"] },
    ],
  };
  const levels = topoSortLevels(def);
  check("3 niveaux (aucun parallélisme possible ici)", levels?.length === 3);
  check("ordre respecté : A puis B puis C", JSON.stringify(levels) === JSON.stringify([["A"], ["B"], ["C"]]));
}

console.log("\n[2] topoSortLevels — 3 nœuds, B et C dépendent de A (parallélisables)");
{
  const def: WorkflowDef = {
    nodes: [
      { id: "A", task: "a" },
      { id: "B", task: "b", dependsOn: ["A"] },
      { id: "C", task: "c", dependsOn: ["A"] },
    ],
  };
  const levels = topoSortLevels(def);
  check("2 niveaux", levels?.length === 2);
  check("niveau 1 = [A]", JSON.stringify(levels?.[0]) === JSON.stringify(["A"]));
  check("niveau 2 = B et C ensemble (parallèle)", levels?.[1].sort().join(",") === "B,C");
}

console.log("\n[3] topoSortLevels — cycle détecté → null (jamais de throw)");
{
  const def: WorkflowDef = {
    nodes: [
      { id: "A", task: "a", dependsOn: ["B"] },
      { id: "B", task: "b", dependsOn: ["A"] },
    ],
  };
  check("cycle → null", topoSortLevels(def) === null);
}

console.log("\n[4] runWorkflow — exécution niveau par niveau via delegate injecté");
{
  const calls: Array<{ task: string; id: string }> = [];
  const fakeDelegate: DelegateFn = async (task, id) => {
    calls.push({ task, id });
    return { id, ok: true, summary: `fait: ${task}` };
  };
  const def: WorkflowDef = {
    nodes: [
      { id: "A", task: "préparer" },
      { id: "B", task: "construire", dependsOn: ["A"] },
      { id: "C", task: "vérifier", dependsOn: ["A"] },
    ],
  };
  const r = await runWorkflow(def, fakeDelegate);
  check("workflow global ok", r.ok === true);
  check("3 résultats", r.results.length === 3);
  check("A appelé avant B et C (ordre topologique respecté)", calls[0].id === "A");
  check("2 niveaux exécutés", r.levels.length === 2);
  check("chaque nœud délégué exactement une fois", calls.length === 3);
}

console.log("\n[5] runWorkflow — cycle → résultat d'échec propre, pas d'exception");
{
  const def: WorkflowDef = { nodes: [{ id: "A", task: "a", dependsOn: ["A"] }] };
  const r = await runWorkflow(def, async (t, id) => ({ id, ok: true, summary: t }));
  check("ok = false", r.ok === false);
  check("cycleError renseigné", !!r.cycleError);
  check("aucun nœud exécuté", r.results.length === 0);
}

console.log("\n[6] runWorkflow — un nœud en échec n'empêche pas les autres du même niveau");
{
  const def: WorkflowDef = { nodes: [{ id: "A", task: "a" }, { id: "B", task: "b" }] };
  const r = await runWorkflow(def, async (t, id) => ({ id, ok: id !== "A", summary: t }));
  check("2 résultats malgré l'échec de A", r.results.length === 2);
  check("ok global = false (au moins un échec)", r.ok === false);
  check("B a bien réussi", r.results.find((x) => x.id === "B")?.ok === true);
}

console.log("\n[7] runWorkflow — delegate qui lève est capté (jamais de throw)");
{
  const def: WorkflowDef = { nodes: [{ id: "A", task: "a" }] };
  const thrower: DelegateFn = async () => { throw new Error("réseau KO"); };
  let threw = false;
  let r: Awaited<ReturnType<typeof runWorkflow>> | undefined;
  try { r = await runWorkflow(def, thrower); } catch { threw = true; }
  check("pas de throw", !threw);
  check("résultat marqué en échec", r?.results[0]?.ok === false);
}

console.log(`\n${fail === 0 ? "✅" : "❌"} eleve-workflow : ${pass} ok, ${fail} ko`);
if (fail > 0) process.exit(1);
