// Tests de concept-consolidation.ts. Déterministe, zéro réseau (embed injecté),
// fichier de télémétrie temporaire par test.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Blackboard } from "../kernel/kernel-blackboard.js";
import { MemoryStore } from "../kernel/kernel-blackboard-store.js";
import { validateConceptGap, recordConceptGap, CONCEPT_SCOPE, type ConceptEntry } from "../concept-registry.js";
import {
  logVerification,
  loadVerifications,
  consoliderConfiance,
  RENFORCEMENT_MIN_HITS,
} from "../concept-consolidation.js";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

function tmpTelemetryFile(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mango-concept-telemetry-"));
  return path.join(dir, "concept-verifications.jsonl");
}
function tmpGapsFile(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mango-concept-gaps2-"));
  return path.join(dir, "concept-gaps.json");
}

async function seedConcept(bb: Blackboard, mot: string, confianceInitiale = 0.5): Promise<void> {
  process.env.CONCEPT_GAPS_FILE = tmpGapsFile();
  const gap = recordConceptGap({ mot, definitionCandidate: "def", contexteDeValidite: "ctx" });
  await validateConceptGap(gap.id, {}, { bb, embed: async () => [] });
  // force une confiance de départ différente de 1 pour observer un vrai delta
  const entry = bb.get<ConceptEntry>(CONCEPT_SCOPE, mot) as ConceptEntry;
  bb.put(CONCEPT_SCOPE, mot, { ...entry, confiance: confianceInitiale });
}

async function main() {
  // ── logVerification / loadVerifications : append-only, tolérant à la casse ──
  {
    process.env.CONCEPT_TELEMETRY_FILE = tmpTelemetryFile();
    logVerification({ concept: "formation", contexteSignature: "app éducative", verdict: "correspond", cheminUtilise: "rapide", issuePositive: true });
    logVerification({ concept: "formation", contexteSignature: "app éducative", verdict: "correspond", cheminUtilise: "rapide", issuePositive: null });
    const events = loadVerifications();
    check("2 événements journalisés", events.length === 2);
    check("champs corrects", events[0]!.concept === "formation" && events[0]!.verdict === "correspond");

    // Ligne corrompue au milieu du fichier → ignorée, pas de crash.
    fs.appendFileSync(process.env.CONCEPT_TELEMETRY_FILE!, "{ceci n'est pas du JSON\n");
    logVerification({ concept: "dashboard", contexteSignature: "app pro", verdict: "ne-correspond-pas", cheminUtilise: "lent", issuePositive: false });
    const events2 = loadVerifications();
    check("ligne corrompue ignorée, les valides survivent", events2.length === 3);
  }

  // ── consoliderConfiance : succès répétés → renforcement ─────────────────────
  {
    process.env.CONCEPT_TELEMETRY_FILE = tmpTelemetryFile();
    const bb = new Blackboard(new MemoryStore());
    await seedConcept(bb, "formation", 0.5);
    for (let i = 0; i < RENFORCEMENT_MIN_HITS; i++) {
      logVerification({ concept: "formation", contexteSignature: "app éducative", verdict: "correspond", cheminUtilise: "rapide", issuePositive: true });
    }
    const result = await consoliderConfiance({ bb, embed: async () => [1, 0, 0] });
    check("concept renforcé après N succès consécutifs", result.renforces.includes("formation"));
    const updated = bb.get<ConceptEntry>(CONCEPT_SCOPE, "formation");
    check("confiance a RÉELLEMENT augmenté", (updated?.confiance ?? 0) > 0.5);
  }

  // ── consoliderConfiance : SOUS le seuil → pas de renforcement ───────────────
  {
    process.env.CONCEPT_TELEMETRY_FILE = tmpTelemetryFile();
    const bb = new Blackboard(new MemoryStore());
    await seedConcept(bb, "dashboard", 0.5);
    logVerification({ concept: "dashboard", contexteSignature: "app pro", verdict: "correspond", cheminUtilise: "rapide", issuePositive: true }); // 1 seul, < RENFORCEMENT_MIN_HITS
    const result = await consoliderConfiance({ bb, embed: async () => [1, 0, 0] });
    check("pas de renforcement sous le seuil", !result.renforces.includes("dashboard"));
    const updated = bb.get<ConceptEntry>(CONCEPT_SCOPE, "dashboard");
    check("confiance inchangée", updated?.confiance === 0.5);
  }

  // ── consoliderConfiance : contradiction → DÉGRADATION (même avec des succès aussi) ─
  {
    process.env.CONCEPT_TELEMETRY_FILE = tmpTelemetryFile();
    const bb = new Blackboard(new MemoryStore());
    await seedConcept(bb, "crm", 0.8);
    // Beaucoup de succès...
    for (let i = 0; i < 5; i++) {
      logVerification({ concept: "crm", contexteSignature: "app pro", verdict: "correspond", cheminUtilise: "rapide", issuePositive: true });
    }
    // ...MAIS une contradiction réelle (jugé "correspond" mais l'issue finale était mauvaise).
    logVerification({ concept: "crm", contexteSignature: "app pro", verdict: "correspond", cheminUtilise: "rapide", issuePositive: false });
    const result = await consoliderConfiance({ bb, embed: async () => [1, 0, 0] });
    check("contradiction détectée → dégradation (pas renforcement malgré les succès)", result.degrades.includes("crm") && !result.renforces.includes("crm"));
    const updated = bb.get<ConceptEntry>(CONCEPT_SCOPE, "crm");
    check("confiance a RÉELLEMENT baissé", (updated?.confiance ?? 1) < 0.8);
  }

  // ── consoliderConfiance : issues toutes inconnues (null) → ignoré, pas d'erreur ─
  {
    process.env.CONCEPT_TELEMETRY_FILE = tmpTelemetryFile();
    const bb = new Blackboard(new MemoryStore());
    await seedConcept(bb, "widget", 0.5);
    logVerification({ concept: "widget", contexteSignature: "x", verdict: "correspond", cheminUtilise: "rapide", issuePositive: null });
    const result = await consoliderConfiance({ bb, embed: async () => [1, 0, 0] });
    check("issues inconnues → concept ignoré (ni renforcé ni dégradé)", result.ignores.includes("widget") && !result.renforces.includes("widget") && !result.degrades.includes("widget"));
  }

  // ── consoliderConfiance : concept inconnu du Blackboard → ne lève pas ───────
  {
    process.env.CONCEPT_TELEMETRY_FILE = tmpTelemetryFile();
    const bb = new Blackboard(new MemoryStore());
    for (let i = 0; i < RENFORCEMENT_MIN_HITS; i++) {
      logVerification({ concept: "jamais-valide", contexteSignature: "x", verdict: "correspond", cheminUtilise: "rapide", issuePositive: true });
    }
    let threw = false;
    let result;
    try {
      result = await consoliderConfiance({ bb, embed: async () => [1, 0, 0] });
    } catch { threw = true; }
    check("concept jamais validé dans le Blackboard → pas d'exception", !threw);
    check("et n'apparaît nulle part (updateConceptConfidence renvoie null)", !result?.renforces.includes("jamais-valide"));
  }

  delete process.env.CONCEPT_TELEMETRY_FILE;
  delete process.env.CONCEPT_GAPS_FILE;
  console.log(`\n${fail === 0 ? "✅" : "❌"} concept-consolidation : ${pass} pass, ${fail} fail`);
  if (fail > 0) process.exit(1);
}

main();
