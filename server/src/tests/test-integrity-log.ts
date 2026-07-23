// Tests du journal d'intégrité (integrity-log.ts, #196 fault-finding Partie 1,
// 2026-07-23) — fonctions pures/fichier local, aucun réseau.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { logDrop, logValidationDrop, readAuditLog } from "../integrity-log.js";
import { line, makeCheck } from "./test-util.js";

let failures = 0;
const check = makeCheck(() => { failures++; });

function withTmpLog<T>(fn: (file: string) => T): T {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "integrity-log-test-"));
  const file = path.join(dir, "audit.log.jsonl");
  const prev = process.env.INTEGRITY_AUDIT_LOG_FILE;
  process.env.INTEGRITY_AUDIT_LOG_FILE = file;
  try {
    return fn(file);
  } finally {
    if (prev === undefined) delete process.env.INTEGRITY_AUDIT_LOG_FILE; else process.env.INTEGRITY_AUDIT_LOG_FILE = prev;
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

line("═");
console.log("integrity-log — logDrop / readAuditLog");
line();

withTmpLog(() => {
  check("aucun journal au départ", readAuditLog().length === 0);

  logDrop({ kind: "validation-drop", store: "test-store", ids: ["a", "b"], reason: "rejeté" });
  const entries = readAuditLog();
  check("1 entrée journalisée", entries.length === 1);
  check("store correct", entries[0]?.store === "test-store");
  check("ids corrects", JSON.stringify(entries[0]?.ids) === JSON.stringify(["a", "b"]));
  check("reason porté", entries[0]?.reason === "rejeté");
  check("ts posé", typeof entries[0]?.ts === "string" && entries[0].ts.length > 0);
});

withTmpLog(() => {
  // ids vide → n'écrit RIEN (pas de bruit dans le journal pour un no-op).
  logDrop({ kind: "validation-drop", store: "test-store", ids: [] });
  check("ids vide → aucune entrée", readAuditLog().length === 0);
});

withTmpLog((file) => {
  // Plusieurs appels s'accumulent (append), et une ligne corrompue est tolérée.
  logDrop({ kind: "vanished-between-snapshots", store: "s1", ids: ["x"] });
  logDrop({ kind: "vanished-between-snapshots", store: "s2", ids: ["y", "z"] });
  fs.appendFileSync(file, "\nceci n'est pas du JSON\n");
  logDrop({ kind: "vanished-between-snapshots", store: "s3", ids: ["w"] });
  const entries = readAuditLog();
  check("3 entrées valides malgré la ligne corrompue", entries.length === 3);
  check("ligne corrompue ignorée, pas de crash", entries.every((e) => typeof e.store === "string"));
});

line();
console.log("integrity-log — logValidationDrop (diff avant/après validation)");
line();

withTmpLog(() => {
  const before = [{ id: "a" }, { id: "b" }, { id: "c" }];
  const after = [{ id: "a" }, { id: "c" }]; // "b" a été rejeté par la validation
  logValidationDrop("specialist-agents", before, after, (r) => (r as { id?: string })?.id ?? null);
  const entries = readAuditLog();
  check("1 entrée pour la perte détectée", entries.length === 1);
  check("seul 'b' est signalé", JSON.stringify(entries[0]?.ids) === JSON.stringify(["b"]));
  check("kind = validation-drop", entries[0]?.kind === "validation-drop");
});

withTmpLog(() => {
  // Rien de perdu → aucune entrée journalisée.
  const before = [{ id: "a" }, { id: "b" }];
  const after = [{ id: "a" }, { id: "b" }];
  logValidationDrop("store", before, after, (r) => (r as { id?: string })?.id ?? null);
  check("rien de perdu → journal vide", readAuditLog().length === 0);
});

withTmpLog(() => {
  // Une entrée sans id exploitable AVANT est ignorée du diff (pas de faux positif).
  const before = [{ id: "a" }, { notAnId: true }];
  const after = [{ id: "a" }];
  logValidationDrop("store", before, after, (r) => (r as { id?: string })?.id ?? null);
  check("entrée sans id exploitable ignorée du diff", readAuditLog().length === 0);
});

withTmpLog(() => {
  // idOf qui throw → best-effort, ne casse jamais la sauvegarde appelante.
  const before = [{ id: "a" }];
  const after: { id?: string }[] = [];
  let threw = false;
  try {
    logValidationDrop("store", before, after, () => { throw new Error("boom"); });
  } catch {
    threw = true;
  }
  check("logValidationDrop ne laisse jamais remonter une exception", !threw);
});

line("═");
console.log(failures === 0 ? "✅ integrity-log : tout est prouvé." : `❌ ${failures} échec(s)`);
process.exit(failures === 0 ? 0 : 1);
