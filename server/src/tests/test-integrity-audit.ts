// Tests du vérificateur d'intégrité (integrity-audit.ts, #196 fault-finding Partie 1,
// 2026-07-23) — cibles INJECTÉES (jamais les vrais stores de l'écosystème), fonctions
// pures/fichier local, aucun réseau.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { auditOnce, type IntegrityTarget } from "../integrity-audit.js";
import { readAuditLog } from "../integrity-log.js";
import { line, makeCheck } from "./test-util.js";

let failures = 0;
const check = makeCheck(() => { failures++; });

function withTmpFiles<T>(fn: () => T): T {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "integrity-audit-test-"));
  const prevSnap = process.env.INTEGRITY_SNAPSHOT_FILE;
  const prevLog = process.env.INTEGRITY_AUDIT_LOG_FILE;
  process.env.INTEGRITY_SNAPSHOT_FILE = path.join(dir, "snapshot.json");
  process.env.INTEGRITY_AUDIT_LOG_FILE = path.join(dir, "audit.log.jsonl");
  try {
    return fn();
  } finally {
    if (prevSnap === undefined) delete process.env.INTEGRITY_SNAPSHOT_FILE; else process.env.INTEGRITY_SNAPSHOT_FILE = prevSnap;
    if (prevLog === undefined) delete process.env.INTEGRITY_AUDIT_LOG_FILE; else process.env.INTEGRITY_AUDIT_LOG_FILE = prevLog;
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function fakeTarget(name: string, ids: string[], knownShrinkage?: string): IntegrityTarget {
  return { name, loadIds: () => ids, ...(knownShrinkage ? { knownShrinkage } : {}) };
}

line("═");
console.log("integrity-audit — auditOnce (amorçage, détection, décroissance voulue)");
line();

withTmpFiles(() => {
  // 1er appel : aucun snapshot précédent → aucune trouvaille, juste l'amorçage.
  const findings = auditOnce([fakeTarget("store-a", ["1", "2", "3"])]);
  check("1er appel (amorçage) → aucune trouvaille", findings.length === 0);
  check("journal vide au 1er appel", readAuditLog().length === 0);
});

withTmpFiles(() => {
  // 2e appel avec MOINS d'ids → détecte la perte.
  auditOnce([fakeTarget("store-a", ["1", "2", "3"])]);
  const findings = auditOnce([fakeTarget("store-a", ["1", "3"])]); // "2" a disparu
  check("perte détectée au 2e appel", findings.length === 1);
  check("store correct", findings[0]?.store === "store-a");
  check("id perdu correct", JSON.stringify(findings[0]?.vanishedIds) === JSON.stringify(["2"]));
  check("journalisé aussi (integrity-log.ts)", readAuditLog().length === 1);
});

withTmpFiles(() => {
  // Aucun changement → aucune trouvaille.
  auditOnce([fakeTarget("store-a", ["1", "2"])]);
  const findings = auditOnce([fakeTarget("store-a", ["1", "2"])]);
  check("rien de changé → aucune trouvaille", findings.length === 0);
});

withTmpFiles(() => {
  // Une entrée AJOUTÉE (pas perdue) → aucune trouvaille (on ne signale QUE les pertes).
  auditOnce([fakeTarget("store-a", ["1"])]);
  const findings = auditOnce([fakeTarget("store-a", ["1", "2"])]);
  check("ajout d'entrée → aucune trouvaille (pas une perte)", findings.length === 0);
});

withTmpFiles(() => {
  // knownShrinkage propagé dans la trouvaille (contexte, ne bloque pas la détection).
  auditOnce([fakeTarget("open-gaps", ["a", "b"], "plafond MAX_GAPS=200")]);
  const findings = auditOnce([fakeTarget("open-gaps", ["a"], "plafond MAX_GAPS=200")]);
  check("perte détectée MÊME avec une décroissance voulue documentée", findings.length === 1);
  check("knownShrinkage propagé dans la trouvaille", findings[0]?.knownShrinkage === "plafond MAX_GAPS=200");
});

withTmpFiles(() => {
  // Plusieurs stores indépendants — chacun suivi séparément, pas de contamination croisée.
  auditOnce([fakeTarget("store-a", ["a1", "a2"]), fakeTarget("store-b", ["b1"])]);
  const findings = auditOnce([fakeTarget("store-a", ["a1"]), fakeTarget("store-b", ["b1"])]); // seul store-a perd
  check("1 seul store affecté, l'autre intact", findings.length === 1 && findings[0]?.store === "store-a");
});

withTmpFiles(() => {
  // loadIds qui THROW → traité comme [] (fail-open), ne casse jamais l'audit entier.
  const broken: IntegrityTarget = { name: "broken", loadIds: () => { throw new Error("boom"); } };
  auditOnce([fakeTarget("store-a", ["1"]), broken]);
  let threw = false;
  try {
    auditOnce([fakeTarget("store-a", ["1"]), broken]);
  } catch {
    threw = true;
  }
  check("loadIds qui lève ne casse jamais auditOnce", !threw);
});

withTmpFiles(() => {
  // Un id vide/non-string est déjà filtré par idsOf en amont (testé indirectement ici
  // via une cible qui renvoie une liste propre) — pas de faux positif sur des valeurs
  // vides accidentelles.
  auditOnce([fakeTarget("store-a", [])]);
  const findings = auditOnce([fakeTarget("store-a", [])]);
  check("store toujours vide → aucune trouvaille", findings.length === 0);
});

line("═");
console.log(failures === 0 ? "✅ integrity-audit : tout est prouvé." : `❌ ${failures} échec(s)`);
process.exit(failures === 0 ? 0 : 1);
