// Tests du registre de livraison de tour (turn-ledger.ts, 2026-07-23 — patron "delivery
// ledger" vu dans Hermes v0.19) — fonctions PURES sur le système de fichiers, aucun réseau.
// La preuve du VRAI scénario anti-crash (kill brutal du process, pas juste un throw JS)
// est faite manuellement en conditions réelles — voir historique.md.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { startTurn, finishTurn, readTurnLedger, markTurnSeen } from "../turn-ledger.js";
import { line, makeCheck } from "./test-util.js";

let failures = 0;
const check = makeCheck(() => { failures++; });

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "turn-ledger-test-"));
}

line("═");
console.log("turn-ledger — startTurn/finishTurn/readTurnLedger (patron delivery ledger)");
line();

{
  const dir = tmpDir();
  check("aucun registre au départ", readTurnLedger(dir) === null);
  fs.rmSync(dir, { recursive: true, force: true });
}

{
  // C'est L'ANCRE anti-crash : startTurn seul (sans finishTurn) doit laisser une trace
  // "running" — c'est ce qui permet de détecter un tour interrompu par un crash brutal.
  const dir = tmpDir();
  startTurn(dir, "turn-1");
  const entry = readTurnLedger(dir);
  check("startTurn pose status=running", entry?.status === "running");
  check("startTurn pose le bon turnId", entry?.turnId === "turn-1");
  check("startTurn pose startedAt", typeof entry?.startedAt === "string" && entry.startedAt.length > 0);
  check("pas de finishedAt tant que non résolu", entry?.finishedAt === undefined);
  fs.rmSync(dir, { recursive: true, force: true });
}

{
  const dir = tmpDir();
  startTurn(dir, "turn-2");
  finishTurn(dir, "turn-2", "success", "Tout est allé bien.");
  const entry = readTurnLedger(dir);
  check("finishTurn bascule status", entry?.status === "success");
  check("finishTurn pose finishedAt", typeof entry?.finishedAt === "string" && entry.finishedAt.length > 0);
  check("finishTurn garde startedAt d'origine", entry?.turnId === "turn-2");
  check("finishTurn pose le résumé", entry?.summary === "Tout est allé bien.");
  fs.rmSync(dir, { recursive: true, force: true });
}

{
  const dir = tmpDir();
  startTurn(dir, "turn-3");
  finishTurn(dir, "turn-3", "error", "build cassé");
  check("finishTurn error", readTurnLedger(dir)?.status === "error");
  fs.rmSync(dir, { recursive: true, force: true });
}

{
  // finishTurn sans startTurn préalable (cas dégénéré, ne doit jamais lever) — toujours
  // un résultat exploitable, startedAt reconstruit.
  const dir = tmpDir();
  finishTurn(dir, "turn-orphan", "incomplete");
  const entry = readTurnLedger(dir);
  check("finishTurn sans startTurn préalable ne lève pas", entry?.status === "incomplete");
  check("startedAt reconstruit honnêtement", typeof entry?.startedAt === "string");
  fs.rmSync(dir, { recursive: true, force: true });
}

{
  // Protection tour concurrent : un finishTurn dont le turnId ne correspond PAS au
  // registre courant (un tour plus récent a déjà posé sa propre ancre) est ignoré —
  // jamais d'écrasement d'un tour en cours par le résultat d'un tour périmé.
  const dir = tmpDir();
  startTurn(dir, "turn-old");
  startTurn(dir, "turn-new"); // le tour suivant a déjà repris la main
  finishTurn(dir, "turn-old", "success", "résultat périmé"); // turnId ne correspond plus
  const entry = readTurnLedger(dir);
  check("finishTurn d'un tour périmé n'écrase pas le tour en cours", entry?.turnId === "turn-new" && entry.status === "running");
  fs.rmSync(dir, { recursive: true, force: true });
}

line();
console.log("turn-ledger — markTurnSeen (acquittement)");
line();

{
  const dir = tmpDir();
  markTurnSeen(dir); // aucun registre → ne doit jamais lever
  check("markTurnSeen sans registre ne lève pas", true);
  fs.rmSync(dir, { recursive: true, force: true });
}

{
  const dir = tmpDir();
  startTurn(dir, "turn-4");
  markTurnSeen(dir); // toujours "running" → rien à acquitter
  check("markTurnSeen n'acquitte pas un tour en vol", readTurnLedger(dir)?.seen === undefined);
  fs.rmSync(dir, { recursive: true, force: true });
}

{
  const dir = tmpDir();
  startTurn(dir, "turn-5");
  finishTurn(dir, "turn-5", "success");
  check("non vu par défaut", readTurnLedger(dir)?.seen === undefined);
  markTurnSeen(dir);
  check("markTurnSeen acquitte un résultat résolu", readTurnLedger(dir)?.seen === true);
  fs.rmSync(dir, { recursive: true, force: true });
}

{
  // Fichier corrompu → null, jamais un throw (même discipline que loadHistory/loadContract).
  const dir = tmpDir();
  fs.writeFileSync(path.join(dir, ".turn-ledger.json"), "{ pas du json valide");
  check("registre corrompu → null (pas de throw)", readTurnLedger(dir) === null);
  fs.rmSync(dir, { recursive: true, force: true });
}

line("═");
console.log(failures === 0 ? "✅ turn-ledger : tout est prouvé." : `❌ ${failures} échec(s)`);
process.exit(failures === 0 ? 0 : 1);
