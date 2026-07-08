// Tests de chaine-ambigue.ts. Déterministe, zéro réseau (extraire/juger/embed/
// chercherDefinitionWeb tous injectés). Point le plus important à prouver :
// moins de 2 termes ambigus détectés → "coherente" directe, juge JAMAIS appelé.
import { Blackboard } from "./kernel-blackboard.js";
import { MemoryStore } from "./kernel-blackboard-store.js";
import { validateConceptGap, recordConceptGap } from "./concept-registry.js";
import { verifierChaineAmbigue, parseVerdictChaine, parseTermesDetectes } from "./chaine-ambigue.js";
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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mango-chaine-gaps-"));
  return path.join(dir, "concept-gaps.json");
}

async function main() {
  // ── parseVerdictChaine : les 3 verdicts + fail-open ─────────────────────────
  {
    check("parse : coherente", parseVerdictChaine("VERDICT: coherente | direction claire").verdict === "coherente");
    check("parse : incoherente", parseVerdictChaine("VERDICT: incoherente | deux directions contradictoires").verdict === "incoherente");
    check("parse : incertaine", parseVerdictChaine("VERDICT: incertaine | doute réel").verdict === "incertaine");
    const bad = parseVerdictChaine("réponse hors format");
    check("parse illisible → verdict FORCÉ incertaine (jamais coherente)", bad.verdict === "incertaine" && bad.parsed === false);
  }

  // ── parseTermesDetectes : JSON valide / invalide / absent ───────────────────
  {
    const ok = parseTermesDetectes('{"termes":[{"terme":"cellule","sensProbableDansLeBrief":"cellule de crise"},{"terme":"marché","sensProbableDansLeBrief":"marché public"}]}');
    check("JSON valide → 2 termes", ok.length === 2 && ok[0]!.terme === "cellule");
    check("JSON invalide → []", parseTermesDetectes("n'importe quoi").length === 0);
    check("JSON absent → []", parseTermesDetectes("").length === 0);
    const trop = parseTermesDetectes('{"termes":[{"terme":"a"},{"terme":"b"},{"terme":"c"},{"terme":"d"},{"terme":"e"}]}');
    check("plafond à 4 termes max", trop.length === 4);
  }

  // ── verifierChaineAmbigue : < 2 termes → "coherente" directe, juge jamais appelé ─
  {
    let jugerAppele = false;
    const rapport = await verifierChaineAmbigue("app de suivi d'une portée de chatons", {
      extraire: async () => '{"termes":[{"terme":"portée","sensProbableDansLeBrief":"portée de chatons"}]}',
      juger: async () => { jugerAppele = true; return "VERDICT: coherente | ok"; },
    });
    check("1 seul terme détecté → coherente directe", rapport.verdict === "coherente");
    check("1 seul terme → juge JAMAIS appelé", !jugerAppele);
  }
  {
    let jugerAppele = false;
    const rapport = await verifierChaineAmbigue("brief sans aucun terme ambigu", {
      extraire: async () => '{"termes":[]}',
      juger: async () => { jugerAppele = true; return "VERDICT: coherente | ok"; },
    });
    check("0 terme détecté → coherente directe", rapport.verdict === "coherente");
    check("0 terme → juge jamais appelé", !jugerAppele);
  }

  // ── verifierChaineAmbigue : cas positif — chaîne cohérente ──────────────────
  {
    const bb = new Blackboard(new MemoryStore());
    const trace = { jugerAppele: false, userVuParLeJuge: "" };
    const rapport = await verifierChaineAmbigue(
      "app de suivi d'une portée de chatons qui vient de naître, avec suivi du sevrage",
      {
        bb, embed: async () => [],
        extraire: async () => '{"termes":[{"terme":"portée","sensProbableDansLeBrief":"portée de chatons"},{"terme":"sevrage","sensProbableDansLeBrief":"sevrage des chatons"}]}',
        chercherDefinitionWeb: async (mot) => `définition web de "${mot}" dans un contexte animalier`,
        juger: async (_sys, user) => {
          trace.jugerAppele = true;
          trace.userVuParLeJuge = user;
          return "VERDICT: coherente | les deux termes pointent vers le suivi d'une portée de chatons";
        },
      },
    );
    check("2 termes → juge APPELÉ", trace.jugerAppele === true);
    check("le juge reçoit le brief complet", trace.userVuParLeJuge.includes("portée de chatons"));
    check("verdict : coherente", rapport.verdict === "coherente");
    check("termesEnJeu contient les 2 termes", rapport.termesEnJeu.includes("portée") && rapport.termesEnJeu.includes("sevrage"));
  }

  // ── verifierChaineAmbigue : cas négatif — chaîne incohérente réelle ─────────
  {
    const bb = new Blackboard(new MemoryStore());
    process.env.CONCEPT_GAPS_FILE = tmpGapsFile();
    const gap = recordConceptGap({
      mot: "cellule",
      definitionCandidate: "une cellule de crise municipale, structure de gestion d'incident",
      contexteDeValidite: "app de sécurité publique",
    });
    await validateConceptGap(gap.id, {}, { bb, embed: async () => [] });

    const rapport = await verifierChaineAmbigue(
      "Fais-moi une app sur la cellule de crise pour gérer le marché de notre greffe",
      {
        bb, embed: async () => [],
        extraire: async () => '{"termes":[{"terme":"cellule","sensProbableDansLeBrief":"cellule de crise"},{"terme":"marché","sensProbableDansLeBrief":"marché public ou e-commerce ?"},{"terme":"greffe","sensProbableDansLeBrief":"greffe du tribunal ou greffe horticole ?"}]}',
        chercherDefinitionWeb: async (mot) => `définition ambiguë de "${mot}"`,
        juger: async () => "VERDICT: incoherente | les trois termes pointent vers des directions incompatibles (sécurité publique, e-commerce, horticulture)",
      },
    );
    check("verdict : incoherente", rapport.verdict === "incoherente");
    check("termesEnJeu contient les 3 termes", rapport.termesEnJeu.length === 3);
    check("définition du chemin rapide (cellule) réutilisée", rapport.definitionsUtilisees["cellule"]?.includes("cellule de crise municipale") ?? false);
  }

  // ── fail-open : juge indisponible ────────────────────────────────────────────
  {
    let threw = false;
    let rapport;
    try {
      rapport = await verifierChaineAmbigue("brief avec plusieurs mots pièges consécutifs", {
        extraire: async () => '{"termes":[{"terme":"a","sensProbableDansLeBrief":"x"},{"terme":"b","sensProbableDansLeBrief":"y"}]}',
        juger: async () => { throw new Error("juge indisponible"); },
      });
    } catch { threw = true; }
    check("juge qui throw → fail-open (pas d'exception)", !threw && rapport?.verdict === "incertaine");
    check("juge qui throw → parsed:false", rapport?.parsed === false);
  }

  // ── fail-open : extraction indisponible → [] → coherente sans juge ──────────
  {
    let jugerAppele = false;
    const rapport = await verifierChaineAmbigue("brief quelconque", {
      extraire: async () => { throw new Error("extracteur indisponible"); },
      juger: async () => { jugerAppele = true; return "VERDICT: incoherente | x"; },
    });
    check("extraction qui throw → [] → coherente directe", rapport.verdict === "coherente");
    check("extraction qui throw → juge jamais appelé", !jugerAppele);
  }

  delete process.env.CONCEPT_GAPS_FILE;
  console.log(`\n${fail === 0 ? "✅" : "❌"} chaine-ambigue : ${pass} pass, ${fail} fail`);
  if (fail > 0) process.exit(1);
}

main();
