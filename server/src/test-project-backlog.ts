// Tests de la boîte noire par projet (#183) — project-backlog.ts.
// Couvre : append + lecture (JSONL), troncature du détail, tolérance aux lignes
// corrompues, limit, formatage, et le fail-open total (dir absent/invalide).

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { appendBacklog, readBacklog, formatBacklogEntry, truncateDetail, BACKLOG_FILE_NAME } from "./project-backlog.js";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "mango-backlog-"));
}

async function main() {
  // ---- append + lecture de base ----
  {
    const dir = tmpDir();
    appendBacklog(dir, { actor: "Élève (glm-5.2:cloud)", action: "write_file", detail: "src/App.jsx", ok: true });
    appendBacklog(dir, { actor: "Gardien", action: "clôture", detail: "OK", ok: true });
    const entries = readBacklog(dir);
    check("2 entrées écrites → 2 lues", entries.length === 2);
    check("ordre préservé (append-only)", entries[0].action === "write_file" && entries[1].action === "clôture");
    check("ts auto-généré (ISO)", !!entries[0].ts && !Number.isNaN(Date.parse(entries[0].ts)));
    check("actor préservé", entries[0].actor === "Élève (glm-5.2:cloud)");
    check("ok=true préservé", entries[1].ok === true);
  }

  // ---- ok absent quand non fourni ----
  {
    const dir = tmpDir();
    appendBacklog(dir, { actor: "Stratège", action: "OnBlock", detail: "flaky-resource" });
    const entries = readBacklog(dir);
    check("ok absent reste absent (pas de false forcé)", entries[0].ok === undefined);
  }

  // ---- fichier inexistant → [] ----
  {
    const dir = tmpDir();
    check("lecture sans fichier → []", readBacklog(dir).length === 0);
  }

  // ---- ligne corrompue ignorée, pas de crash ----
  {
    const dir = tmpDir();
    appendBacklog(dir, { actor: "A", action: "x" });
    fs.appendFileSync(path.join(dir, BACKLOG_FILE_NAME), "{ceci n'est pas du JSON\n");
    appendBacklog(dir, { actor: "B", action: "y" });
    const entries = readBacklog(dir);
    check("ligne corrompue ignorée, les 2 valides survivent", entries.length === 2);
    check("entrée A puis B dans l'ordre", entries[0].actor === "A" && entries[1].actor === "B");
  }

  // ---- limit ----
  {
    const dir = tmpDir();
    for (let i = 0; i < 5; i++) appendBacklog(dir, { actor: "Élève", action: `étape${i}` });
    const last2 = readBacklog(dir, 2);
    check("limit renvoie les N DERNIÈRES entrées", last2.length === 2 && last2[0].action === "étape3" && last2[1].action === "étape4");
    check("limit=0 → pas de troncature (falsy)", readBacklog(dir, 0).length === 5);
  }

  // ---- troncature du détail ----
  {
    check("detail court inchangé", truncateDetail("court") === "court");
    const long = "x".repeat(300);
    const t = truncateDetail(long);
    check("detail long tronqué à ~220 + …", t.length <= 222 && t.endsWith("…"));
    check("espaces multiples normalisés", truncateDetail("a   b\n\nc") === "a b c");
  }

  // ---- appendBacklog tronque déjà à l'écriture ----
  {
    const dir = tmpDir();
    appendBacklog(dir, { actor: "Élève", action: "write_file", detail: "z".repeat(500) });
    const entries = readBacklog(dir);
    check("le detail persisté est déjà tronqué", (entries[0].detail?.length ?? 0) <= 222);
  }

  // ---- fail-open total : dir vide/absent ne lève jamais ----
  {
    check("appendBacklog(\"\", …) ne lève pas", (() => {
      try { appendBacklog("", { actor: "A", action: "x" }); return true; } catch { return false; }
    })());
    check("appendBacklog(dir inexistant profond) ne lève pas", (() => {
      try { appendBacklog(path.join(os.tmpdir(), "n-existe-pas-183", "sous-dossier"), { actor: "A", action: "x" }); return true; } catch { return false; }
    })());
  }

  // ---- formatage ----
  {
    const e = { ts: "2026-07-08T10:00:00.000Z", actor: "Gardien", action: "clôture", detail: "goût 82/100", ok: true };
    check("format OK sans marqueur ❌", formatBacklogEntry(e) === "[2026-07-08T10:00:00.000Z] Gardien · clôture — goût 82/100");
    const bad = { ...e, ok: false };
    check("format échec avec ❌", formatBacklogEntry(bad).endsWith(" ❌"));
    const noDetail = { ts: e.ts, actor: "Élève", action: "finish" };
    check("format sans detail", formatBacklogEntry(noDetail) === "[2026-07-08T10:00:00.000Z] Élève · finish");
  }

  console.log(`\n${pass} passés, ${fail} échoués`);
  if (fail > 0) process.exit(1);
}

main();
