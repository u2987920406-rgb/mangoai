// Tests du pont registre↔runtime (brain-runtime.ts, Phase E2). Zéro réseau :
// BRAINS_DIR redirigé vers un dossier temporaire, registre amorcé via brains.ts.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "mango-brt-"));
process.env.BRAINS_DIR = TMP;

const { cardFromScan, upsertBrain, setRouting } = await import("./brains.js");
const { resolveBinding, profileForBrain, deriveIntention, globalFallback, policyForBinding } = await import("./brain-runtime.js");
const { resolveProfile } = await import("./models/profile.js");
import type { ScanReport, ScanVerdict } from "./model-scan.js";

let pass = 0, fail = 0;
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

function fakeReport(model: string, verdict: ScanVerdict): ScanReport {
  const agentic = verdict === "agentic";
  const caps = agentic
    ? { axiomCap: 10, fileBudget: 24_000, fileMax: 6_000, maxAttempts: 3 }
    : { axiomCap: 4, fileBudget: 9_000, fileMax: 3_000, maxAttempts: 2 };
  return { model, probes: [], capabilities: {}, verdict, suggestedProfile: { agentic, caps, verdict }, avgLatencyMs: 1, summary: "" };
}

async function run() {
  console.log("\n[1] profileForBrain : prose de famille préservée, caps+agentic mesurés priment");
  {
    const card = cardFromScan(fakeReport("gemma4:12b", "agentic"), "openai", { scannedAt: "x" });
    const prof = profileForBrain(card);
    const base = resolveProfile("gemma4:12b");
    check("system/axiomes de la famille conservés", prof.system === base.system && prof.axiomFiles === base.axiomFiles);
    check("caps écrasées par la mesure", prof.caps.axiomCap === 10 && prof.caps.fileBudget === 24_000);
    check("agentic écrasé par la mesure (true alors que Gemma=contrat)", prof.agentic === true);
  }

  console.log("\n[2] resolveBinding sans routage → repli global (card null)");
  {
    const b = resolveBinding("construire");
    const g = globalFallback();
    check("model = global", b.model === g.model);
    check("provider = global", b.provider === g.provider);
    check("card null (rien d'affecté)", b.card === null);
  }

  console.log("\n[3] resolveBinding avec routage → cerveau affecté");
  {
    upsertBrain(cardFromScan(fakeReport("glm-4.6:cloud", "agentic"), "openai", { label: "GLM", scannedAt: "x" }));
    upsertBrain(cardFromScan(fakeReport("gemma4:12b", "contract"), "ollama", { label: "Gemma", scannedAt: "x" }));
    setRouting("construire", "glm-4-6-cloud");
    setRouting("discuter", "gemma4-12b");
    const c = resolveBinding("construire");
    check("construire → GLM cloud (openai)", c.model === "glm-4.6:cloud" && c.provider === "openai");
    check("construire → profil agentic (mesuré)", c.profile.agentic === true);
    check("construire → card.label = GLM", c.card?.label === "GLM");
    const d = resolveBinding("discuter");
    check("discuter → Gemma local (ollama)", d.model === "gemma4:12b" && d.provider === "ollama");
    check("discuter → profil non-agentic (contrat)", d.profile.agentic === false);
    const p = resolveBinding("planifier");
    check("planifier non affecté → repli global", p.card === null);
  }

  console.log("\n[4] deriveIntention : explicite valide sinon depuis le mode (+ requiredCaps #182 É2)");
  {
    check("bouton construire respecté", (await deriveIntention(true, "construire")).intention === "construire");
    check("bouton planifier respecté", (await deriveIntention(false, "planifier")).intention === "planifier");
    check("valeur inconnue + discuss → discuter", (await deriveIntention(true, "n'importe")).intention === "discuter");
    check("valeur absente + build → construire", (await deriveIntention(false, undefined)).intention === "construire");
    // Sans task/context : sur-provisionnement read-safe seul (étage 1 de D2), rien de plus.
    const base = await deriveIntention(true, "discuter");
    check("sans tâche → requiredCaps = {read-local, read-web} seulement", base.requiredCaps.size === 2 && base.requiredCaps.has("read-local") && base.requiredCaps.has("read-web"));
    // Tâche avec signal vision → capacité ajoutée AU MÊME joint.
    const withVision = await deriveIntention(true, "discuter", "regarde le rendu de la page d'accueil");
    check("tâche « regarde le rendu » → requiredCaps contient vision", withVision.requiredCaps.has("vision"));
  }

  console.log("\n[5] Phase E3 — policyForBinding : outils gatés par la force mesurée");
  {
    // Repli global (pas de fiche) sur profil agentique → plein pouvoir.
    const g = globalFallback();
    const globalBinding = { intention: "construire" as const, model: g.model, provider: g.provider, profile: { ...g.profile, agentic: true }, card: null };
    const pg = policyForBinding(globalBinding);
    check("repli global agentique → run + delegate permis", pg.allowRun && pg.allowDelegate);

    // Cerveau agentique au function-calling PARFAIT (tool=1) → plein pouvoir.
    const strongCard = { ...cardFromScan(fakeReport("strong", "agentic"), "openai", { scannedAt: "x" }), capabilities: { "appel d'outils": 1 } };
    upsertBrain(strongCard);
    setRouting("construire", strongCard.id);
    const ps = policyForBinding(resolveBinding("construire"));
    check("cerveau fort (tool=1) → run + delegate permis", ps.allowRun && ps.allowDelegate);

    // Cerveau agentique au function-calling BORDERLINE (tool=0.7) → run oui, delegate non.
    const midCard = { ...cardFromScan(fakeReport("mid", "agentic"), "openai", { scannedAt: "x" }), capabilities: { "appel d'outils": 0.7 } };
    const pm = policyForBinding({ intention: "construire", model: midCard.model, provider: midCard.provider, profile: profileForBrain(midCard), card: midCard });
    check("tool=0.7 → run permis mais delegate retiré", pm.allowRun && !pm.allowDelegate);

    // Cerveau au function-calling FAIBLE (tool=0.5) → ni run ni delegate.
    const weakCard = { ...cardFromScan(fakeReport("weak", "agentic"), "openai", { scannedAt: "x" }), capabilities: { "appel d'outils": 0.5 } };
    const pw = policyForBinding({ intention: "construire", model: weakCard.model, provider: weakCard.provider, profile: profileForBrain(weakCard), card: weakCard });
    check("tool=0.5 → run ET delegate retirés", !pw.allowRun && !pw.allowDelegate);

    // Profil non-agentique → aucun outil d'action.
    const nonAg = { intention: "discuter" as const, model: "x", provider: "ollama" as const, profile: { ...g.profile, agentic: false }, card: null };
    const pn = policyForBinding(nonAg);
    check("profil non-agentique → ni run ni delegate", !pn.allowRun && !pn.allowDelegate);
  }

  console.log("\n[6] #162 — globalFallback (cerveau Élève) = l'agent `codeur` du registre");
  {
    // L'Élève par défaut EST l'agent `codeur` → pilotable depuis l'Atelier.
    const REG = path.join(TMP, "brain-registry.json");
    const prev = process.env.BRAIN_REGISTRY_FILE;
    try {
      fs.writeFileSync(REG, JSON.stringify({ codeur: { provider: "ollama", model: "mon-codeur:1b", timeoutMs: 42 } }));
      process.env.BRAIN_REGISTRY_FILE = REG;
      const g = globalFallback();
      check("model repris de codeur", g.model === "mon-codeur:1b");
      check("provider repris de codeur", g.provider === "ollama");
      check("profil dérivé du modèle codeur", g.profile.system === resolveProfile("mon-codeur:1b").system);
    } finally {
      if (prev === undefined) delete process.env.BRAIN_REGISTRY_FILE;
      else process.env.BRAIN_REGISTRY_FILE = prev;
    }
  }

  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* best-effort */ }
  console.log(`\n${fail === 0 ? "✅" : "❌"} brain-runtime : ${pass} pass, ${fail} fail`);
  if (fail > 0) process.exit(1);
}

run().catch((e) => { console.error(e); process.exit(1); });
