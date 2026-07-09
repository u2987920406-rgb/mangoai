// Tests de verificateur-contexte.ts. Déterministe, zéro réseau (juger/embed/
// chercherDefinitionWeb tous injectés). Le point le plus important à prouver :
// un hit dans l'index rapide NE court-circuite JAMAIS l'appel au juge.
import { Blackboard } from "../kernel/kernel-blackboard.js";
import { MemoryStore } from "../kernel/kernel-blackboard-store.js";
import { validateConceptGap, recordConceptGap, loadConceptGaps, CONCEPT_SCOPE } from "../concept-registry.js";
import { verifierChoix, parseVerdictContexte } from "../verificateur-contexte.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

function tmpGapsFile(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mango-verif-gaps-"));
  return path.join(dir, "concept-gaps.json");
}

async function main() {
  // ── parseVerdictContexte : les 3 verdicts + fail-open ───────────────────────
  {
    check("parse : correspond", parseVerdictContexte("VERDICT: correspond | tout va bien").verdict === "correspond");
    check("parse : ne-correspond-pas", parseVerdictContexte("VERDICT: ne-correspond-pas | c'est un quiz, pas un cours").verdict === "ne-correspond-pas");
    check("parse : incertain", parseVerdictContexte("VERDICT: incertain | pas assez d'info").verdict === "incertain");
    const bad = parseVerdictContexte("je ne sais pas quoi répondre");
    check("parse illisible → verdict FORCÉ incertain (jamais correspond)", bad.verdict === "incertain" && bad.parsed === false);
    const empty = parseVerdictContexte("");
    check("parse vide → incertain, parsed false", empty.verdict === "incertain" && !empty.parsed);
  }

  // ── verifierChoix : AUCUNE définition disponible → incertain, juge jamais appelé ─
  {
    const bb = new Blackboard(new MemoryStore());
    let jugerAppele = false;
    const rapport = await verifierChoix("motinconnu", "contexte", "contenu", "tâche", {
      bb, embed: async () => [], juger: async () => { jugerAppele = true; return "VERDICT: correspond | x"; },
    });
    check("aucune définition → verdict incertain", rapport.verdict === "incertain");
    check("aucune définition → juge JAMAIS appelé (rien à juger)", !jugerAppele);
    check("aucune définition → chemin=aucun", rapport.cheminUtilise === "aucun");
  }

  // ── verifierChoix : CHEMIN RAPIDE (hit index) — le juge est TOUJOURS appelé ──
  {
    const bb = new Blackboard(new MemoryStore());
    process.env.CONCEPT_GAPS_FILE = tmpGapsFile();
    const gap = recordConceptGap({
      mot: "formation",
      definitionCandidate: "un cours structuré qui enseigne AVANT de tester, pas un quiz seul",
      contexteDeValidite: "app éducative pour apprendre une compétence",
    });
    await validateConceptGap(gap.id, {}, { bb, embed: async () => [] });

    const trace = { jugerAppele: false, contenuVuParLeJuge: "" };
    const rapport = await verifierChoix(
      "formation",
      "app éducative pour apprendre une compétence",
      "gabarit contenant : Placement.jsx (quiz forcé en premier écran), aucune Lecon avant",
      "construire une formation sur X",
      {
        bb, embed: async () => [],
        juger: async (_sys, user) => {
          trace.jugerAppele = true;
          trace.contenuVuParLeJuge = user;
          return "VERDICT: ne-correspond-pas | le gabarit impose un quiz avant tout cours, contraire à la définition";
        },
      },
    );
    check("chemin rapide utilisé (hit index)", rapport.cheminUtilise === "rapide");
    check("le juge EST APPELÉ MÊME sur un hit d'index (jamais court-circuité)", trace.jugerAppele === true);
    check("le juge reçoit le CONTENU RÉEL, pas juste le nom", trace.contenuVuParLeJuge.includes("Placement.jsx") && trace.contenuVuParLeJuge.includes("quiz forcé"));
    check("verdict : ne-correspond-pas (rejet du gabarit)", rapport.verdict === "ne-correspond-pas");
    check("definitionUtilisee = la définition VALIDÉE de l'index", rapport.definitionUtilisee.includes("AVANT de tester"));
  }

  // ── verifierChoix : CHEMIN LENT (miss index, recherche web) — dépose une lacune ─
  {
    const bb = new Blackboard(new MemoryStore());
    process.env.CONCEPT_GAPS_FILE = tmpGapsFile();
    const traceWeb = { webAppele: false };
    const rapport = await verifierChoix(
      "dashboard",
      "app de suivi de métriques business",
      "gabarit contenant un formulaire de saisie libre, aucun graphique",
      "construire un dashboard de ventes",
      {
        bb, embed: async () => [],
        chercherDefinitionWeb: async () => { traceWeb.webAppele = true; return "un dashboard affiche des métriques/graphiques synthétiques, pas un formulaire de saisie"; },
        juger: async () => "VERDICT: ne-correspond-pas | aucun graphique dans le gabarit",
      },
    );
    check("chemin lent utilisé (miss index)", rapport.cheminUtilise === "lent");
    check("recherche web appelée", traceWeb.webAppele === true);
    check("verdict correct", rapport.verdict === "ne-correspond-pas");
    check("une lacune de sens a été déposée", loadConceptGaps().some((g) => g.mot === "dashboard"));
  }

  // ── verifierChoix : chemin lent absent (pas de recherche web injectée) ──────
  {
    const bb = new Blackboard(new MemoryStore());
    const rapport = await verifierChoix("x", "y", "z", "t", { bb, embed: async () => [], juger: async () => "VERDICT: correspond | ok" });
    check("pas de chercherDefinitionWeb → chemin=aucun, incertain", rapport.cheminUtilise === "aucun" && rapport.verdict === "incertain");
  }

  // ── verifierChoix : le juge throw → fail-open (incertain, pas d'exception) ──
  {
    const bb = new Blackboard(new MemoryStore());
    process.env.CONCEPT_GAPS_FILE = tmpGapsFile();
    const gap = recordConceptGap({ mot: "crm", definitionCandidate: "gestion de la relation client", contexteDeValidite: "app pro" });
    await validateConceptGap(gap.id, {}, { bb, embed: async () => [] });
    let threw = false;
    let rapport;
    try {
      rapport = await verifierChoix("crm", "app pro", "contenu", "tâche", {
        bb, embed: async () => [], juger: async () => { throw new Error("réseau indisponible"); },
      });
    } catch { threw = true; }
    check("juge qui throw → fail-open (pas d'exception)", !threw && rapport?.verdict === "incertain");
    check("juge qui throw → parsed:false (signal visible, pas silencieux)", rapport?.parsed === false);
  }

  delete process.env.CONCEPT_GAPS_FILE;
  console.log(`\n${fail === 0 ? "✅" : "❌"} verificateur-contexte : ${pass} pass, ${fail} fail`);
  if (fail > 0) process.exit(1);
}

main();
