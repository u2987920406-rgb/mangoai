// Tests déterministes de l'Observateur-Conseil (D2b) — readObserverReport().
// Workspace temp injecté (paramètre, pas d'I/O sur le vrai workspace).
// Lancer : npx tsx src/test-mangoqa-observer.ts
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { readObserverReport } from "../mangoqa.js";

let pass = 0, fail = 0;
function check(label: string, cond: boolean): void {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

console.log("═".repeat(56));
console.log("mangoqa — readObserverReport (D2b Observateur-Conseil)");
console.log("─".repeat(56));

function mkWorkspace(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "mangoqa-observer-"));
}

function reportPath(ws: string): string {
  const dir = path.join(ws, ".mangoqa");
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, "observer-report.json");
}

// ── 1. Absent ─────────────────────────────────────────────────────────────
{
  const ws = mkWorkspace();
  const r = readObserverReport(ws);
  check("workspace sans .mangoqa/ → available:false", r.available === false);
  check("→ reason: absent", !r.available && r.reason === "absent");
  fs.rmSync(ws, { recursive: true, force: true });
}

// ── 2. Dossier .mangoqa présent mais fichier absent ─────────────────────────
{
  const ws = mkWorkspace();
  fs.mkdirSync(path.join(ws, ".mangoqa"), { recursive: true });
  const r = readObserverReport(ws);
  check(".mangoqa/ sans observer-report.json → absent", !r.available && r.reason === "absent");
  fs.rmSync(ws, { recursive: true, force: true });
}

// ── 3. JSON pourri (non parseable) ──────────────────────────────────────────
{
  const ws = mkWorkspace();
  fs.writeFileSync(reportPath(ws), "{ ceci n'est pas du JSON valide", "utf8");
  const r = readObserverReport(ws);
  check("JSON non parseable → invalide", !r.available && r.reason === "invalide");
  fs.rmSync(ws, { recursive: true, force: true });
}

// ── 4. JSON valide mais forme incorrecte (clés manquantes) ─────────────────
{
  const ws = mkWorkspace();
  fs.writeFileSync(reportPath(ws), JSON.stringify({ generatedAt: "2026-07-03T00:00:00.000Z" }), "utf8");
  const r = readObserverReport(ws);
  check("JSON valide, forme incomplète → invalide", !r.available && r.reason === "invalide");
  fs.rmSync(ws, { recursive: true, force: true });
}

// ── 5. Forme valide complète → toutes les clés ──────────────────────────────
{
  const ws = mkWorkspace();
  const valid = {
    generatedAt: "2026-07-03T08:00:00.000Z",
    windowEvents: 12,
    report: {
      totalEvents: 12,
      patterns: [
        { kind: "branche-recurrente", subject: "♿ Accessibilité", count: 3, share: 0.25, examples: ["ex1"] },
      ],
      suggestions: ["Ajouter un label systématique aux champs email"],
      summary: "12 événements, 1 motif récurrent détecté.",
    },
    rendered: "Observateur-Conseil\n— 12 événements\n— 1 motif récurrent",
  };
  fs.writeFileSync(reportPath(ws), JSON.stringify(valid), "utf8");
  const r = readObserverReport(ws);
  check("forme valide → available:true", r.available === true);
  if (r.available) {
    check("→ generatedAt propagé", r.generatedAt === valid.generatedAt);
    check("→ windowEvents propagé", r.windowEvents === 12);
    check("→ report.summary propagé", r.report.summary === valid.report.summary);
    check("→ report.suggestions propagé", r.report.suggestions.length === 1);
    check("→ report.patterns propagé", r.report.patterns.length === 1 && r.report.patterns[0].subject === "♿ Accessibilité");
    check("→ rendered propagé", r.rendered === valid.rendered);
  }
  fs.rmSync(ws, { recursive: true, force: true });
}

// ── 6. Fichier trop volumineux (>1 Mo) → refusé ─────────────────────────────
{
  const ws = mkWorkspace();
  const huge = {
    generatedAt: "2026-07-03T08:00:00.000Z",
    windowEvents: 1,
    report: { totalEvents: 1, patterns: [], suggestions: [], summary: "x".repeat(1_100_000) },
    rendered: "x",
  };
  fs.writeFileSync(reportPath(ws), JSON.stringify(huge), "utf8");
  const r = readObserverReport(ws);
  check(">1 Mo → refusé (illisible)", !r.available && r.reason === "illisible");
  fs.rmSync(ws, { recursive: true, force: true });
}

console.log("═".repeat(56));
if (fail === 0) console.log(`✅ All ${pass}/${pass} checks passed.`);
else { console.log(`❌ ${fail} échec(s) (${pass} ok).`); process.exit(1); }
