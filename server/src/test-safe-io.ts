// Tests A0.1 (2026-07-03) — écriture/append ATOMIQUES + verrou sériel.
// Prouve : atomicAppendFileSync crée+concatène avec séparateur \n correct ;
// atomicAppendFile (async) sérialise 20 appends concurrents sans perte ni
// écrasement ; aucun fichier .tmp ne fuit ; comportement identique à l'ancien
// appendFileSync côté contenu final.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { atomicWriteFileSync, atomicAppendFileSync, atomicAppendFile } from "./safe-io.js";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "safeio-"));
const noTmp = (f: string) => !fs.existsSync(`${f}.tmp`);

console.log("─".repeat(60));
console.log("test-safe-io (A0.1)");
console.log("─".repeat(60));

// ── atomicWriteFileSync : de base ────────────────────────────────────────────
{
  const f = path.join(dir, "w.txt");
  atomicWriteFileSync(f, "hello");
  check("write crée le fichier", fs.readFileSync(f, "utf8") === "hello");
  atomicWriteFileSync(f, "world");
  check("write écrase", fs.readFileSync(f, "utf8") === "world");
  check("aucun .tmp résiduel", noTmp(f));
}

// ── atomicAppendFileSync : fichier absent / présent / sans \n final ──────────
{
  const f = path.join(dir, "a.txt");
  atomicAppendFileSync(f, "L1\n");
  check("append sur fichier absent → crée", fs.readFileSync(f, "utf8") === "L1\n");
  atomicAppendFileSync(f, "L2\n");
  check("append concatène", fs.readFileSync(f, "utf8") === "L1\nL2\n");
  check("aucun .tmp résiduel", noTmp(f));
}
{
  // Fichier NE se terminant PAS par \n → séparateur inséré (comme l'ancien appendAxiom).
  const f = path.join(dir, "b.txt");
  fs.writeFileSync(f, "AXIOM-1"); // pas de \n final
  atomicAppendFileSync(f, "AXIOM-2\n");
  check("séparateur \\n inséré si absent", fs.readFileSync(f, "utf8") === "AXIOM-1\nAXIOM-2\n");
}
{
  // Fichier VIDE → pas de séparateur en tête.
  const f = path.join(dir, "c.txt");
  fs.writeFileSync(f, "");
  atomicAppendFileSync(f, "X\n");
  check("fichier vide → pas de \\n en tête", fs.readFileSync(f, "utf8") === "X\n");
}

// ── Parité avec l'ancien appendFileSync (même contenu final) ─────────────────
{
  const old = path.join(dir, "old.txt");
  const neu = path.join(dir, "neu.txt");
  for (const line of ["a\n", "b\n", "c\n"]) {
    // ancien comportement d'appendAxiom : prefix \n si pas terminé par \n
    let prefix = "";
    try { const cur = fs.readFileSync(old, "utf8"); if (cur.length > 0 && !cur.endsWith("\n")) prefix = "\n"; } catch { /* absent */ }
    fs.appendFileSync(old, `${prefix}${line}`);
    atomicAppendFileSync(neu, line);
  }
  check("parité contenu final vs appendFileSync", fs.readFileSync(old, "utf8") === fs.readFileSync(neu, "utf8"));
}

// ── Verrou sériel : 20 appends CONCURRENTS → 20 lignes, 0 perte ──────────────
async function concurrency(): Promise<void> {
  const f = path.join(dir, "concurrent.txt");
  const N = 20;
  await Promise.all(Array.from({ length: N }, (_, i) => atomicAppendFile(f, `line-${i}\n`)));
  const lines = fs.readFileSync(f, "utf8").trim().split("\n").filter(Boolean);
  check(`20 appends concurrents → 20 lignes (obtenu ${lines.length})`, lines.length === N);
  const uniq = new Set(lines);
  check("aucune ligne perdue ni dupliquée", uniq.size === N);
  check("aucun .tmp résiduel après concurrence", noTmp(f));

  console.log(`\n${fail === 0 ? "✅" : "❌"} safe-io : ${pass} pass, ${fail} fail`);
  fs.rmSync(dir, { recursive: true, force: true });
  if (fail > 0) process.exit(1);
}

void concurrency();
