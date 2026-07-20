// Tests C4 (2026-07-03) — profils de cerveau + BRAIN_PROFILE + BRAIN_LOCAL_ONLY.
// Isole le registre via BRAIN_REGISTRY_FILE (dossier temp) et les profils via un
// dossier temp. Prouve : lecture/validation d'un profil, application avec backup,
// refus d'un profil corrompu (registre intact), forçage localOnly gaté, et
// bascule BRAIN_PROFILE. Gate off = identité stricte.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readProfile, applyProfile } from "../apply-brain-profile.js";
import { loadBrainRegistry, AGENT_IDS } from "../brain/brain-registry.js";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

console.log("─".repeat(60));
console.log("test-brain-profile (C4)");
console.log("─".repeat(60));

// readProfile lit les VRAIS profils du repo (full-local doit exister et être complet).
console.log("\n[1] readProfile — full-local réel : registre complet et valide");
{
  const p = readProfile("full-local");
  check("full-local lu", p !== null);
  check(`${AGENT_IDS.length} rôles présents`, p !== null && AGENT_IDS.every((id) => !!p[id]?.provider));
  check("tous en ollama localOnly", p !== null && AGENT_IDS.every((id) => p[id].provider === "ollama" && p[id].localOnly === true));
  check("profil inexistant → null", readProfile("nope-inexistant") === null);
}

// applyProfile sur un registre ISOLÉ (temp) — backup + remplacement.
console.log("\n[2] applyProfile — bascule + backup, registre isolé");
{
  const prevReg = process.env.BRAIN_REGISTRY_FILE;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "brainprof-"));
  const regFile = path.join(dir, "brain-registry.json");
  // registre de départ = un cerveau cloud pour le codeur
  fs.writeFileSync(regFile, JSON.stringify({ codeur: { provider: "openai", model: "glm-5.2:cloud" } }, null, 2));
  process.env.BRAIN_REGISTRY_FILE = regFile;
  try {
    const before = loadBrainRegistry();
    check("avant : codeur en openai cloud", before.codeur.provider === "openai");
    const r = applyProfile("full-local", regFile);
    check("application OK", r.ok === true);
    check("backup créé", !!r.backupPath && fs.existsSync(r.backupPath!));
    check("message rappelle L51 (full-local)", /L51/.test(r.message));
    const after = loadBrainRegistry();
    check("après : codeur en ollama local", after.codeur.provider === "ollama" && after.codeur.localOnly === true);
    // Backup fidèle à l'avant.
    const bak = JSON.parse(fs.readFileSync(r.backupPath!, "utf8"));
    check("backup = état d'avant (codeur openai)", bak.codeur.provider === "openai");
  } finally {
    if (prevReg === undefined) delete process.env.BRAIN_REGISTRY_FILE; else process.env.BRAIN_REGISTRY_FILE = prevReg;
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// Profil corrompu → refus SANS toucher le registre.
console.log("\n[3] applyProfile — profil invalide refusé, registre intact");
{
  const p = readProfile("full-local");
  check("un profil valide passe", p !== null);
  const r = applyProfile("nope-inexistant");
  check("profil inexistant → refus", r.ok === false && /introuvable ou invalide/.test(r.message));
}

// BRAIN_LOCAL_ONLY : forçage global gaté.
console.log("\n[4] BRAIN_LOCAL_ONLY — force localOnly partout (gaté)");
{
  const prevReg = process.env.BRAIN_REGISTRY_FILE;
  const prevFlag = process.env.BRAIN_LOCAL_ONLY;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "brainlo-"));
  const regFile = path.join(dir, "brain-registry.json");
  fs.writeFileSync(regFile, JSON.stringify({ orchestrateur: { provider: "claude", model: "opus" } }, null, 2));
  process.env.BRAIN_REGISTRY_FILE = regFile;
  try {
    delete process.env.BRAIN_LOCAL_ONLY;
    const off = loadBrainRegistry();
    check("gate off → localOnly non forcé (orchestrateur claude sans localOnly)", off.orchestrateur.localOnly !== true);
    process.env.BRAIN_LOCAL_ONLY = "on";
    const on = loadBrainRegistry();
    check("gate on → TOUS localOnly=true", AGENT_IDS.every((id) => on[id].localOnly === true));
    check("gate on → provider préservé (juste localOnly ajouté)", on.orchestrateur.provider === "claude");
  } finally {
    if (prevReg === undefined) delete process.env.BRAIN_REGISTRY_FILE; else process.env.BRAIN_REGISTRY_FILE = prevReg;
    if (prevFlag === undefined) delete process.env.BRAIN_LOCAL_ONLY; else process.env.BRAIN_LOCAL_ONLY = prevFlag;
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

console.log(`\n${fail === 0 ? "✅" : "❌"} brain-profile : ${pass} pass, ${fail} fail`);
if (fail > 0) process.exit(1);
