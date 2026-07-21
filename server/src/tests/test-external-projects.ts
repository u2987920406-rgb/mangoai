// #193 — Test de preuve du registre de projets locaux externes (external-projects.ts,
// section Code). 100% pur/local : fichiers temp jetables injectés, zéro réseau, zéro env.
// Prouve : add/dédoublonnage/mise à jour, dossier inexistant refusé, remove, pont coffre
// (addGrantToFile appelé au même geste), fail-safe sur fichier absent/corrompu.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  loadExternalProjects,
  saveExternalProjects,
  addExternalProject,
  removeExternalProject,
  getExternalProject,
} from "../external-projects.js";
import { loadGrants } from "../perimeter.js";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

function run() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mango-extproj-"));
  const projFile = path.join(dir, "external-projects.json");
  const grantsFile = path.join(dir, "desktop-grants.json");
  const realDir = fs.mkdtempSync(path.join(os.tmpdir(), "mango-extproj-target-"));

  console.log("\n[1] loadExternalProjects — fail-safe");
  {
    check("fichier absent → []", loadExternalProjects(projFile).length === 0);
    fs.writeFileSync(projFile, "{ pas du json");
    check("JSON corrompu → []", loadExternalProjects(projFile).length === 0);
    fs.rmSync(projFile);
  }

  console.log("\n[2] addExternalProject — dossier réel, crée le coffre au même geste");
  {
    const r = addExternalProject("Mon projet", realDir, "rw", projFile, grantsFile);
    check("ok:true", r.ok === true);
    if (r.ok) {
      check("label conservé", r.project.label === "Mon projet");
      check("path normalisé (absolu)", r.project.path === path.resolve(realDir));
      check("mode conservé", r.project.mode === "rw");
      check("id généré", typeof r.project.id === "string" && r.project.id.length > 0);
    }
    check("persisté sur disque", loadExternalProjects(projFile).length === 1);
    // Le coffre doit exister dans le MÊME registre que Réglages → Coffres.
    const grants = loadGrants(grantsFile);
    check("coffre créé au même geste (addGrantToFile appelé)", grants.length === 1 && grants[0].path === path.resolve(realDir) && grants[0].mode === "rw");
  }

  console.log("\n[3] addExternalProject — dossier inexistant refusé");
  {
    const r = addExternalProject("Fantôme", path.join(dir, "n-existe-pas"), "ro", projFile, grantsFile);
    check("ok:false", r.ok === false);
    check("registre inchangé (toujours 1)", loadExternalProjects(projFile).length === 1);
  }

  console.log("\n[4] addExternalProject — re-ajout du MÊME dossier met à jour, pas de doublon");
  {
    const r = addExternalProject("Nouveau nom", realDir, "ro", projFile, grantsFile);
    check("ok:true", r.ok === true);
    check("toujours 1 seule entrée (pas de doublon)", loadExternalProjects(projFile).length === 1);
    const p = loadExternalProjects(projFile)[0];
    check("label mis à jour", p.label === "Nouveau nom");
    check("mode mis à jour", p.mode === "ro");
    if (r.ok) check("id STABLE (même projet, pas un nouvel id)", r.project.id === loadExternalProjects(projFile)[0].id);
  }

  console.log("\n[5] getExternalProject");
  {
    const list = loadExternalProjects(projFile);
    const found = getExternalProject(list[0].id, projFile);
    check("trouvé par id", found?.path === path.resolve(realDir));
    check("id inconnu → undefined", getExternalProject("nope", projFile) === undefined);
  }

  console.log("\n[6] removeExternalProject — ne révoque PAS le coffre");
  {
    const id = loadExternalProjects(projFile)[0].id;
    const remaining = removeExternalProject(id, projFile);
    check("registre vidé", remaining.length === 0 && loadExternalProjects(projFile).length === 0);
    check("coffre TOUJOURS présent (révocation = geste séparé)", loadGrants(grantsFile).length === 1);
  }

  console.log("\n[7] saveExternalProjects — écriture directe (couverture)");
  {
    saveExternalProjects([{ id: "x", label: "L", path: realDir, mode: "ro", addedAt: 1 }], projFile);
    check("relecture rend l'entrée écrite", loadExternalProjects(projFile).length === 1);
  }

  fs.rmSync(dir, { recursive: true, force: true });
  fs.rmSync(realDir, { recursive: true, force: true });

  console.log("\n" + "═".repeat(60));
  console.log(fail === 0 ? `✅ external-projects : ${pass} pass, 0 fail` : `❌ external-projects : ${pass} pass, ${fail} fail`);
  process.exit(fail === 0 ? 0 : 1);
}

run();
