// Sentinelle heartbeat du backend MangoOS (#196 fault-finding Partie 3).
//
// Écrite par le process backend lui-même, lue par watchdog.ts (process séparé)
// pour détecter un backend VIVANT mais BLOQUÉ (hang) — un cas qu'un simple
// `child.on('exit')` ne peut jamais voir. Même patron que la sentinelle
// `.mangoqa-active` de MangoQA (`src/index.ts::beat()`), best-effort : une
// erreur d'écriture ne doit jamais faire tomber le backend.
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
// Override par env (patron déjà établi : CRON_TASKS_FILE, INTEGRITY_SNAPSHOT_FILE…) —
// permet de faire tourner un backend de test isolé sans écraser la sentinelle du
// backend réel en cours (utile pour vérifier watchdog.ts sans toucher la session vivante).
export const SENTINEL_PATH = process.env.BACKEND_HEARTBEAT_FILE ?? path.join(ROOT, ".backend-active");
const HEARTBEAT_MS = 10_000;

function beat(): void {
  try {
    fs.writeFileSync(SENTINEL_PATH, JSON.stringify({ heartbeat: new Date().toISOString(), pid: process.pid }));
  } catch (err) {
    console.warn("[backend-heartbeat]", err instanceof Error ? err.message : err);
  }
}

export function startBackendHeartbeat(): void {
  beat();
  setInterval(beat, HEARTBEAT_MS).unref();
}
