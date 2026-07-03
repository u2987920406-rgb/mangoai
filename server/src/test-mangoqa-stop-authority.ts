// Tests déterministes de l'AUTORITÉ D'ARRÊT du Disjoncteur MangoQA (Visage 1).
//   - readBreakerVerdict()  : lecture fail-open de .mangoqa/breaker-verdict.json
//   - decideBreakerStop()   : décision PURE prise à la frontière d'itération du lot
// Workspace temp injecté, deps injectées → zéro I/O réel sur le vrai workspace,
// zéro réseau. Lancer : npx tsx src/test-mangoqa-stop-authority.ts
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { readBreakerVerdict, type BreakerVerdictResult } from "./mangoqa.js";
import { decideBreakerStop } from "./nocturnal.js";

let pass = 0, fail = 0;
function check(label: string, cond: boolean): void {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

console.log("═".repeat(56));
console.log("mangoqa — autorité d'arrêt Disjoncteur (Visage 1)");
console.log("─".repeat(56));

function mkWorkspace(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "mangoqa-breaker-"));
}
function verdictPath(ws: string): string {
  const dir = path.join(ws, ".mangoqa");
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, "breaker-verdict.json");
}

const safeVerdict = { safe: true, trips: [], evaluatedAt: 111, eventCount: 3 };
const unsafeVerdict = {
  safe: false,
  trips: [
    { breaker: "cost-guard", action: "fallback-local", reason: "Coût cumulé 7.20$ > plafond 5.00$ — bascule cerveau local.", observed: 7.2, threshold: 5, lastEventTs: 222 },
  ],
  evaluatedAt: 222,
  eventCount: 40,
};

// ── A. readBreakerVerdict — lecture fail-open ────────────────────────────────
console.log("readBreakerVerdict — fail-open :");
{
  const ws = mkWorkspace();
  const r = readBreakerVerdict(ws);
  check("workspace sans .mangoqa/ → available:false / absent", !r.available && r.reason === "absent");
  fs.rmSync(ws, { recursive: true, force: true });
}
{
  const ws = mkWorkspace();
  fs.mkdirSync(path.join(ws, ".mangoqa"), { recursive: true });
  const r = readBreakerVerdict(ws);
  check(".mangoqa/ sans verdict → absent", !r.available && r.reason === "absent");
  fs.rmSync(ws, { recursive: true, force: true });
}
{
  const ws = mkWorkspace();
  fs.writeFileSync(verdictPath(ws), "{ pas du JSON", "utf8");
  const r = readBreakerVerdict(ws);
  check("JSON non parseable → invalide", !r.available && r.reason === "invalide");
  fs.rmSync(ws, { recursive: true, force: true });
}
{
  const ws = mkWorkspace();
  fs.writeFileSync(verdictPath(ws), JSON.stringify({ safe: "oui", trips: [] }), "utf8");
  const r = readBreakerVerdict(ws);
  check("safe non-booléen → invalide", !r.available && r.reason === "invalide");
  fs.rmSync(ws, { recursive: true, force: true });
}
{
  const ws = mkWorkspace();
  fs.writeFileSync(verdictPath(ws), JSON.stringify({ safe: false }), "utf8"); // trips manquant
  const r = readBreakerVerdict(ws);
  check("trips absent → invalide", !r.available && r.reason === "invalide");
  fs.rmSync(ws, { recursive: true, force: true });
}
{
  const ws = mkWorkspace();
  fs.writeFileSync(verdictPath(ws), JSON.stringify(safeVerdict), "utf8");
  const r = readBreakerVerdict(ws);
  check("verdict safe:true valide → available:true, safe:true", r.available === true && r.available && r.safe === true);
  check("→ trips vide, evaluatedAt propagé", r.available && r.trips.length === 0 && r.evaluatedAt === 111);
  fs.rmSync(ws, { recursive: true, force: true });
}
{
  const ws = mkWorkspace();
  fs.writeFileSync(verdictPath(ws), JSON.stringify(unsafeVerdict), "utf8");
  const r = readBreakerVerdict(ws);
  check("verdict safe:false valide → available:true, safe:false", r.available && r.safe === false);
  check("→ trip normalisé (breaker/action/reason)", r.available && r.trips.length === 1 && r.trips[0].breaker === "cost-guard" && r.trips[0].action === "fallback-local" && r.trips[0].reason.includes("plafond"));
  fs.rmSync(ws, { recursive: true, force: true });
}
{
  const ws = mkWorkspace();
  fs.writeFileSync(verdictPath(ws), JSON.stringify({ safe: false, trips: [{}, "pas un objet", { breaker: "agent-killswitch" }] }), "utf8");
  const r = readBreakerVerdict(ws);
  check("trips malformés → normalisés défensivement (jamais de crash)", r.available && r.trips.length === 2 && r.trips[0].breaker === "?" && r.trips[1].breaker === "agent-killswitch");
  fs.rmSync(ws, { recursive: true, force: true });
}

// ── B. decideBreakerStop — les 4 scénarios du mandat ─────────────────────────
console.log("decideBreakerStop — décision de frontière :");

const unsafe = (trips: { breaker: string; action: string; reason: string }[]): BreakerVerdictResult =>
  ({ available: true, safe: false, trips, evaluatedAt: 1 });
const safe = (): BreakerVerdictResult => ({ available: true, safe: true, trips: [], evaluatedAt: 1 });
const unavailable = (reason: "absent" | "invalide" | "illisible"): BreakerVerdictResult => ({ available: false, reason });
const oneTrip = [{ breaker: "cost-guard", action: "fallback-local", reason: "Coût cumulé 7.20$ > plafond 5.00$." }];

// (a) gate OFF + verdict unsafe → IGNORÉ (comportement identique à avant) + 0 I/O
{
  let reads = 0;
  const decision = decideBreakerStop(false, () => { reads++; return unsafe(oneTrip); });
  check("(a) gate OFF → stop:false (verdict unsafe ignoré)", decision.stop === false);
  check("(a) gate OFF → readVerdict JAMAIS appelé (0 I/O, byte-identique)", reads === 0);
}
// (b) gate ON + verdict absent (MangoQA non lancé) → continue (fail-open)
{
  const decision = decideBreakerStop(true, () => unavailable("absent"));
  check("(b) gate ON + verdict absent → stop:false (fail-open)", decision.stop === false);
}
{
  const decision = decideBreakerStop(true, () => unavailable("illisible"));
  check("(b') gate ON + verdict illisible → stop:false (fail-open)", decision.stop === false);
}
// (c) gate ON + verdict safe:true → continue
{
  let reads = 0;
  const decision = decideBreakerStop(true, () => { reads++; return safe(); });
  check("(c) gate ON + safe:true → stop:false", decision.stop === false);
  check("(c) gate ON → readVerdict appelé exactement 1×", reads === 1);
}
// (d) gate ON + verdict safe:false → ARRÊT avec raison + trips
{
  const decision = decideBreakerStop(true, () => unsafe(oneTrip));
  check("(d) gate ON + safe:false → stop:true", decision.stop === true);
  check("(d) → raison mentionne le trip (cost-guard)", (decision.reason ?? "").includes("cost-guard"));
  check("(d) → raison mentionne 'non-sûr'", (decision.reason ?? "").includes("non-sûr"));
  check("(d) → trips propagés pour la persistance", (decision.trips ?? []).length === 1);
}
// (d') safe:false sans trips détaillés → arrêt quand même, raison lisible
{
  const decision = decideBreakerStop(true, () => unsafe([]));
  check("(d') safe:false sans trips → stop:true, raison de repli", decision.stop === true && (decision.reason ?? "").includes("aucun trip"));
}

console.log("═".repeat(56));
if (fail === 0) console.log(`✅ All ${pass}/${pass} checks passed.`);
else { console.log(`❌ ${fail} échec(s) (${pass} ok).`); process.exit(1); }
