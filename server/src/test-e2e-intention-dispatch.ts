// PREUVE BOUT-EN-BOUT (#182 É8, mission part 1) — depuis l'Accueil en posture DISCUTER,
// une tâche MULTI-CAPACITÉS « regarde {url} et dis-moi ce que tu vois, et donne-moi la
// date d'aujourd'hui » doit : (a) faire dispatcher à l'Élève vision+web (registre unifié
// FILTRÉ par capacité — É1+É2) ET (b) porter la date/heure réelle dans le prompt (É3).
//
// Reproduit FIDÈLEMENT le chemin home-chat Élève d'index.ts (l.262-286) : mêmes appels
// `requiredCapabilities` → `buildEleveDiscussTools(scratch, caps)`, même assemblage du
// `sys` avec `temporalContext()` en tête. Le SEUL élément simulé est le transport modèle
// (`askEleveAgentic`) : un runner injecté qui INSPECTE les outils reçus et lit la ligne
// temporelle du system — zéro réseau, déterministe. Documente que le dispatch vision+web
// et l'injection temporelle sont réels ; seule la réponse du modèle est mimée.
//   npx tsx src/test-e2e-intention-dispatch.ts

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { requiredCapabilities } from "./intent-capabilities.js";
import { buildEleveDiscussTools } from "./eleve-action-tools.js";
import { temporalContext } from "./temporal-context.js";
import { flag } from "./flags.js";
import type { ToolRegistry } from "./kernel-mcp.js";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

/** Runner Élève simulé : rôle d'`askEleveAgentic`. Il INSPECTE le registre reçu (quels
 *  outils la tâche a débloqués) et LIT la ligne temporelle du system pour prouver qu'elle
 *  lui est disponible — puis « répond » en réutilisant ces faits. Zéro réseau. */
function fakeEleveRunner(sys: string, _task: string, tools: ToolRegistry): { text: string; toolNames: string[] } {
  const toolNames = tools.list().map((t) => t.name);
  const temporalLine = sys.split("\n").find((l) => l.startsWith("Contexte temporel :")) ?? "";
  // Le modèle « se sert » de vision + web (présents dans son registre) et cite la date lue.
  const usedVision = toolNames.includes("vois_ecran");
  const usedWeb = toolNames.includes("extraire_site");
  const parts: string[] = [];
  if (usedWeb) parts.push("j'ai ouvert le site (extraire_site)");
  if (usedVision) parts.push("j'ai regardé le rendu (vois_ecran)");
  parts.push(temporalLine.replace("Contexte temporel : nous sommes le ", "Nous sommes le "));
  return { text: parts.join(" ; "), toolNames };
}

async function run() {
  console.log("─".repeat(64));
  console.log("test-e2e-intention-dispatch (#182 É8 — Accueil Discuter, multi-capacités)");
  console.log("─".repeat(64));

  // Conditions du scénario : Sharingan disponible (ELEVE_VISION=on, sinon vois_ecran ne
  // s'enregistre pas — piège documenté au plan §5.4) ; conscience temporelle ON (défaut).
  const prevVision = process.env.ELEVE_VISION;
  const prevTemporal = process.env.TEMPORAL_AWARENESS;
  process.env.ELEVE_VISION = "on";
  delete process.env.TEMPORAL_AWARENESS; // → défaut ON
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "e2e182-"));

  try {
    check("conscience temporelle active (défaut ON)", flag("TEMPORAL_AWARENESS") === true);

    const task = "regarde https://stripe.com et dis-moi ce que tu vois, et donne-moi la date d'aujourd'hui";

    // ── É2 : l'intention de la tâche → capacités (posture Discuter, sans pièce jointe) ──
    const caps = await requiredCapabilities(task, { hasAttachment: false });
    check("caps dérivées : read-web présent (URL détectée → extraire_site)", caps.has("read-web"));
    check("caps dérivées : vision présente (« regarde » → vois_ecran)", caps.has("vision"));

    // ── É1 : registre unifié FILTRÉ par capacité (plafond read-only de la posture Discuter) ──
    const reg = buildEleveDiscussTools(scratch, caps);
    const names = reg.list().map((t) => t.name);
    check("registre Élève : extraire_site OFFERT (web dispatché)", names.includes("extraire_site"));
    check("registre Élève : vois_ecran OFFERT (vision dispatchée — le trou de 1.2 comblé)", names.includes("vois_ecran"));
    check("registre Élève : AUCUN mutant (plafond read-only Discuter tient)",
      !names.includes("write_file") && !names.includes("run_command") && !names.includes("add_dependency"));

    // ── É3 : assemblage du `sys` À L'IDENTIQUE d'index.ts home-chat (temporalContext en tête) ──
    const sys = [
      flag("TEMPORAL_AWARENESS") ? temporalContext() : "",
      "Tu es MangoOS, l'assistant IA personnel de Raf — chaleureux, direct, concis.",
      "Tu es ici en posture DISCUTER (lire, analyser, conseiller).",
    ].filter(Boolean).join("\n");
    const expected = temporalContext(); // même seconde → même minute affichée
    check("le system commence par la ligne temporelle (injection en tête)", sys.startsWith("Contexte temporel :"));
    const today = `${new Date().getDate()}`;
    check("la ligne temporelle porte la vraie date du jour", sys.includes(expected.slice(0, 30)) && sys.includes(today));

    // ── Bout-en-bout : le runner Élève reçoit vision+web ET voit la date dans son system ──
    const out = fakeEleveRunner(sys, task, reg);
    check("dispatch effectif : le runner a bien reçu vision + web", out.toolNames.includes("vois_ecran") && out.toolNames.includes("extraire_site"));
    check("la réponse porte la date/heure réelle (É3 arrive jusqu'à la sortie)", /Nous sommes le/.test(out.text) && out.text.includes(today));
    console.log(`\n  → réponse simulée : « ${out.text} »`);

    console.log(`\n${fail === 0 ? "✅" : "❌"} e2e-intention-dispatch : ${pass} pass, ${fail} fail`);
    if (fail > 0) process.exit(1);
  } finally {
    if (prevVision === undefined) delete process.env.ELEVE_VISION; else process.env.ELEVE_VISION = prevVision;
    if (prevTemporal === undefined) delete process.env.TEMPORAL_AWARENESS; else process.env.TEMPORAL_AWARENESS = prevTemporal;
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

run().catch((e) => { console.error(e); process.exit(1); });
