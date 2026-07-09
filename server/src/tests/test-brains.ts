// Tests du registre de cerveaux (brains.ts, Phase E #135).
// Déterministe, zéro réseau : on redirige BRAINS_DIR vers un dossier temporaire
// (résolution paresseuse du chemin) et on exerce CRUD + routage + avertissements.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  cardFromScan, upsertBrain, removeBrain, getBrain, setRouting, loadRegistry,
  resolveBrainForIntention, intentionFit, routingWarnings, slugifyModel,
  INTENTIONS, type BrainCard,
} from "../brains.js";
import type { ScanReport, ScanVerdict } from "../model-scan.js";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

// Dossier temporaire isolé (BRAINS_DIR lu à chaque appel par le module).
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "mango-brains-"));
process.env.BRAINS_DIR = TMP;

// Fabrique un faux ScanReport au verdict voulu (le scanner réel est testé ailleurs).
function fakeReport(model: string, verdict: ScanVerdict): ScanReport {
  const agentic = verdict === "agentic";
  const caps = agentic
    ? { axiomCap: 10, fileBudget: 24_000, fileMax: 6_000, maxAttempts: 3 }
    : { axiomCap: 4, fileBudget: 9_000, fileMax: 3_000, maxAttempts: 2 };
  return {
    model,
    probes: [],
    capabilities: { raisonnement: agentic ? 1 : 0.3 },
    verdict,
    suggestedProfile: { agentic, caps, verdict },
    avgLatencyMs: 420,
    summary: `verdict ${verdict}`,
  };
}

async function run() {
  console.log("\n[1] slugify + cardFromScan (mapping pur du scan)");
  {
    check("slug stable & sûr", slugifyModel("GLM-4.6:cloud") === "glm-4-6-cloud");
    check("slug vide → fallback", slugifyModel("***") === "brain");
    const card = cardFromScan(fakeReport("glm-4.6:cloud", "agentic"), "openai", { scannedAt: "2026-06-23T00:00:00Z" });
    check("id dérivé du modèle", card.id === "glm-4-6-cloud");
    check("label par défaut = modèle", card.label === "glm-4.6:cloud");
    check("verdict + agentic + provider repris", card.verdict === "agentic" && card.agentic && card.provider === "openai");
    check("caps mesurées reprises", card.caps.axiomCap === 10);
    const labeled = cardFromScan(fakeReport("gemma4:12b", "contract"), "ollama", { label: "Gemma local", scannedAt: "x" });
    check("label custom respecté", labeled.label === "Gemma local");
  }

  console.log("\n[2] CRUD : upsert / get / remove");
  {
    const glm = cardFromScan(fakeReport("glm-4.6:cloud", "agentic"), "openai", { scannedAt: "x" });
    upsertBrain(glm);
    check("registre persisté sur disque", fs.existsSync(path.join(TMP, "registry.json")));
    check("get retrouve la fiche", getBrain("glm-4-6-cloud")?.model === "glm-4.6:cloud");
    // upsert = remplacement par id (pas de doublon)
    upsertBrain({ ...glm, label: "GLM cloud" });
    check("upsert remplace (pas de doublon)", loadRegistry().brains.length === 1);
    check("upsert a bien mis à jour", getBrain("glm-4-6-cloud")?.label === "GLM cloud");
    upsertBrain(cardFromScan(fakeReport("gemma4:12b", "contract"), "ollama", { scannedAt: "x" }));
    check("2e cerveau ajouté", loadRegistry().brains.length === 2);
  }

  console.log("\n[3] Routage : setRouting + resolveBrainForIntention");
  {
    setRouting("construire", "glm-4-6-cloud");
    setRouting("discuter", "gemma4-12b");
    check("construire → GLM", resolveBrainForIntention("construire")?.id === "glm-4-6-cloud");
    check("discuter → Gemma", resolveBrainForIntention("discuter")?.id === "gemma4-12b");
    check("planifier non affecté → null", resolveBrainForIntention("planifier") === null);
    let threw = false;
    try { setRouting("planifier", "inconnu-x"); } catch { threw = true; }
    check("affecter un cerveau inconnu lève", threw);
    setRouting("construire", null);
    check("désaffectation (null) efface", resolveBrainForIntention("construire") === null);
  }

  console.log("\n[4] removeBrain nettoie aussi les affectations");
  {
    setRouting("discuter", "gemma4-12b");
    removeBrain("gemma4-12b");
    check("fiche supprimée", getBrain("gemma4-12b") === null);
    check("affectation orpheline nettoyée", resolveBrainForIntention("discuter") === null);
  }

  console.log("\n[5] « MangoOS avertit » : intentionFit selon le verdict mesuré");
  {
    const agentic = cardFromScan(fakeReport("strong", "agentic"), "openai", { scannedAt: "x" });
    const contract = cardFromScan(fakeReport("mid", "contract"), "ollama", { scannedAt: "x" });
    const discussB = cardFromScan(fakeReport("weak", "discuss"), "ollama", { scannedAt: "x" });
    const reject = cardFromScan(fakeReport("bad", "reject"), "ollama", { scannedAt: "x" });
    check("construire + agentic = ok", intentionFit("construire", agentic).fit === "ok");
    check("construire + contract = suboptimal", intentionFit("construire", contract).fit === "suboptimal");
    check("construire + discuss = mismatch", intentionFit("construire", discussB).fit === "mismatch");
    check("construire + reject = mismatch", intentionFit("construire", reject).fit === "mismatch");
    check("discuter + discuss = ok", intentionFit("discuter", discussB).fit === "ok");
    check("planifier + reject = mismatch", intentionFit("planifier", reject).fit === "mismatch");
    check("message non vide quand mismatch", intentionFit("construire", reject).message.length > 0);
  }

  console.log("\n[6] routingWarnings : seulement les fits ≠ ok du routage courant");
  {
    // registre frais
    fs.rmSync(path.join(TMP, "registry.json"), { force: true });
    upsertBrain(cardFromScan(fakeReport("strong", "agentic"), "openai", { scannedAt: "x" }));
    upsertBrain(cardFromScan(fakeReport("weak", "discuss"), "ollama", { scannedAt: "x" }));
    setRouting("construire", "weak");   // mismatch attendu
    setRouting("discuter", "strong");   // ok → pas d'avertissement
    const w = routingWarnings();
    check("un seul avertissement (le mismatch construire)", w.length === 1);
    check("avertissement pointe construire", w[0].intention === "construire" && w[0].fit === "mismatch");
    setRouting("construire", "strong");
    check("plus aucun avertissement après correction", routingWarnings().length === 0);
  }

  console.log("\n[7] Couverture des 3 intentions");
  check("INTENTIONS = construire/planifier/discuter", INTENTIONS.join(",") === "construire,planifier,discuter");

  // Nettoyage
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* best-effort */ }

  console.log(`\n${fail === 0 ? "✅" : "❌"} brains : ${pass} pass, ${fail} fail`);
  if (fail > 0) process.exit(1);
}

run().catch((e) => { console.error(e); process.exit(1); });
