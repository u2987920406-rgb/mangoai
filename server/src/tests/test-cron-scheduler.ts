// Tests du scheduler cron (cron-scheduler.ts) — sauvegarde PAR TÂCHE (2026-07-23, #196
// fault-finding Partie 2). loadTasks/saveTaskResult sont les seules fonctions exportées
// pertinentes ici : executeTask/runRelay sont trop lourds pour un test unitaire (vrai
// build agentique), donc ce test prouve le MÉCANISME de sauvegarde incrémentale
// directement, indépendamment de la boucle du tick elle-même.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { line, makeCheck } from "./test-util.js";

let failures = 0;
const check = makeCheck(() => { failures++; });

function tmpFile(): string {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "cron-scheduler-test-")), "cron-tasks.json");
}

const file = tmpFile();
process.env.CRON_TASKS_FILE = file;
const { loadTasks, saveTaskResult } = await import("../cron-scheduler.js");

function seed(tasks: Array<{ id: string; name: string; lastRun?: string; lastResult?: string }>): void {
  fs.writeFileSync(file, JSON.stringify(tasks.map((t) => ({
    id: t.id, name: t.name, projectName: "p", prompt: "…", schedule: "daily" as const,
    enabled: true, createdAt: "2026-01-01T00:00:00.000Z", lastRun: t.lastRun, lastResult: t.lastResult,
  }))));
}

line("═");
console.log("cron-scheduler — saveTaskResult (sauvegarde incrémentale, #196 Partie 2)");
line();

{
  seed([{ id: "t1", name: "Tâche 1" }, { id: "t2", name: "Tâche 2" }, { id: "t3", name: "Tâche 3" }]);
  // Simule EXACTEMENT le scénario de l'incident visé : la tâche 1 termine avec succès,
  // le process "crash" avant même d'appeler saveTaskResult pour la tâche 2 (donc rien
  // n'écrase le fichier après la tâche 1 — c'est le point : sa sauvegarde tient DÉJÀ).
  saveTaskResult("t1", { lastRun: "2026-07-23T03:00:00.000Z", lastResult: "OK tâche 1" });
  const afterCrash = loadTasks();
  check("tâche 1 (terminée AVANT le crash simulé) a bien son résultat persisté", afterCrash.find((t) => t.id === "t1")?.lastResult === "OK tâche 1");
  check("tâche 2 (jamais atteinte) reste sans lastResult — honnête, pas de faux résultat", afterCrash.find((t) => t.id === "t2")?.lastResult === undefined);
  check("tâche 3 intacte, jamais touchée", afterCrash.find((t) => t.id === "t3")?.lastResult === undefined);
}

{
  seed([{ id: "t1", name: "Tâche 1" }]);
  saveTaskResult("t1", { lastRun: "2026-07-23T03:00:00.000Z", lastResult: "premier résultat" });
  saveTaskResult("t1", { lastRun: "2026-07-23T04:00:00.000Z", lastResult: "second résultat" });
  const tasks = loadTasks();
  check("un 2e appel met bien à jour (pas d'accumulation en doublon)", tasks.length === 1 && tasks[0]?.lastResult === "second résultat");
}

{
  seed([{ id: "t1", name: "Tâche 1" }]);
  // id inconnu → no-op silencieux, jamais un throw.
  let threw = false;
  try {
    saveTaskResult("id-inexistant", { lastResult: "x" });
  } catch {
    threw = true;
  }
  check("id inconnu → pas de throw", !threw);
  check("id inconnu → le store reste inchangé", loadTasks().length === 1 && loadTasks()[0]?.lastResult === undefined);
}

{
  // Autre tâche modifiée ENTRE-TEMPS (ex. via la route REST pendant le tick) — la
  // sauvegarde relit le store à l'instant présent, elle n'écrase pas avec une copie
  // en mémoire périmée (contrairement à l'ancien `saveTasks(updated)` en bloc).
  seed([{ id: "t1", name: "Tâche 1" }, { id: "t2", name: "Tâche 2" }]);
  const before = loadTasks();
  // Simule une édition externe de t2 pendant que t1 est en cours de traitement.
  fs.writeFileSync(file, JSON.stringify(before.map((t) => (t.id === "t2" ? { ...t, name: "Renommée entre-temps" } : t))));
  saveTaskResult("t1", { lastRun: "2026-07-23T03:00:00.000Z", lastResult: "OK" });
  const after = loadTasks();
  check("le renommage externe de t2 survit (pas écrasé par une copie périmée)", after.find((t) => t.id === "t2")?.name === "Renommée entre-temps");
  check("t1 a quand même bien son résultat", after.find((t) => t.id === "t1")?.lastResult === "OK");
}

line("═");
console.log(failures === 0 ? "✅ cron-scheduler : tout est prouvé." : `❌ ${failures} échec(s)`);
process.exit(failures === 0 ? 0 : 1);
