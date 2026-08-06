// L'ARBITRAGE DU BUDGET DE RAPPEL (refonte v3, lot 4).
//
// Ce que ce fichier garde, et pourquoi ça vaut un test à part :
//
// `.axioms.md` a atteint 273 859 caractères pour un cap de 3 000. 98,9 % de ce que le
// système avait appris était écrit et jamais relu — et personne ne l'a vu pendant deux
// mois, parce que **la coupe ne disait rien**. Elle rendait un texte plausible, borné,
// sans indiquer qu'elle venait d'écarter 270 000 caractères.
//
// L'assertion centrale de ce fichier n'est donc pas « le budget est respecté » mais
// **« tout ce qui est écarté est déclaré »**. Un budget silencieux est un bug qui met
// deux mois à se voir.
//
// Déterministe, zéro I/O : l'arbitrage est pur, et les lectures de `recall` sont injectées.

import { arbitre, resumeArbitrage, BUDGET_DEFAUT, type Fragment } from "../memory/budget.js";
import { recall } from "../memory/recall.js";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

/** Compteur trivial : 1 token = 1 caractère. Le vrai compteur fait un travail réel de
 *  segmentation ; un test d'arbitrage n'a pas à en dépendre, sinon il teste deux choses
 *  à la fois et n'en prouve aucune. */
const parCaractere = (t: string) => t.length;
const texte = (n: number, c = "x") => c.repeat(n);

async function run() {
  console.log("\n[1] La règle qui structure tout : une coupe se DÉCLARE");
  {
    // Le cas des axiomes, en miniature : un fragment 10× trop gros pour son étage.
    const gros: Fragment[] = [{ etage: "identite", source: ".axioms.md", texte: texte(20_000) }];
    const a = arbitre(gros, { compte: parCaractere });

    check("un fragment hors budget est ÉCARTÉ", a.retenus.length === 0);
    check("…et il est DÉCLARÉ, pas absorbé", a.coupes.length === 1);
    check("la coupe dit combien de tokens sont partis", a.coupes[0].tokens === 20_000);
    check("la coupe dit D'OÙ ça venait", a.coupes[0].source === ".axioms.md");
    check("la coupe dit POURQUOI", a.coupes[0].motif === "budget-etage");
    check("le résumé est lisible par un humain", /écarté/.test(resumeArbitrage(a)));
  }

  console.log("\n[2] La priorité des étages (doc 05 § 2.3)");
  {
    const f: Fragment[] = [
      { etage: "identite", source: "id", texte: texte(1000) },
      { etage: "projet", source: "proj", texte: texte(1000) },
      { etage: "savoir", source: "sav", texte: texte(1000) },
    ];
    // Total volontairement trop petit : il faut rogner quelque part.
    const a = arbitre(f, { compte: parCaractere, total: 2000 });

    const gardes = new Set(a.retenus.map((r) => r.source));
    check("① Identité survit", gardes.has("id"));
    check("③ Projet survit", gardes.has("proj"));
    check("④ Savoir tombe EN PREMIER", !gardes.has("sav"));
    check("…et sa chute est motivée « budget-total »", a.coupes.some((c) => c.source === "sav" && c.motif === "budget-total"));
    check("aucun étage incompressible n'a été amputé", a.incompressibleAmpute === false);
  }

  console.log("\n[3] ④ Savoir d'abord, ② Goût ensuite — jamais ① ni ③");
  {
    const f: Fragment[] = [
      { etage: "identite", source: "id", texte: texte(500) },
      { etage: "gout", source: "gout", texte: texte(500) },
      { etage: "projet", source: "proj", texte: texte(500) },
      { etage: "savoir", source: "sav", texte: texte(500) },
    ];
    const a = arbitre(f, { compte: parCaractere, total: 1000 });
    const gardes = new Set(a.retenus.map((r) => r.source));
    check("les deux incompressibles tiennent exactement le budget", gardes.has("id") && gardes.has("proj"));
    check("④ Savoir et ② Goût ont cédé la place", !gardes.has("sav") && !gardes.has("gout"));
  }

  console.log("\n[4] Amputer un incompressible est une ANOMALIE, pas un fonctionnement");
  {
    // Budget si petit que même l'Identité ne rentre pas. On coupe — un budget reste
    // un budget — mais on le SIGNALE. C'est toute la différence avec l'ancien
    // `capRegistry`, qui coupait exactement de la même façon sans jamais le dire.
    const f: Fragment[] = [
      { etage: "identite", source: "id-1", texte: texte(400) },
      { etage: "identite", source: "id-2", texte: texte(400) },
    ];
    const a = arbitre(f, { compte: parCaractere, total: 500 });
    check("le budget total est respecté", a.tokensRetenus <= 500);
    check("l'amputation d'un incompressible est SIGNALÉE", a.incompressibleAmpute === true);
    check("…et le résumé porte l'alerte", /INCOMPRESSIBLE/.test(resumeArbitrage(a)));

    const sain = arbitre([{ etage: "identite", source: "id", texte: texte(100) }], { compte: parCaractere, total: 500 });
    check("pas d'alerte quand tout rentre", sain.incompressibleAmpute === false);
  }

  console.log("\n[5] Un étage éteint est écarté AVEC SON MOTIF");
  {
    const f: Fragment[] = [{ etage: "gout", source: "palette", texte: texte(100) }];
    const a = arbitre(f, { compte: parCaractere, eteints: ["gout"] });
    check("l'étage éteint ne remonte pas", a.retenus.length === 0);
    check("…et on sait que c'est une extinction, pas un dépassement", a.coupes[0].motif === "etage-eteint");
  }

  console.log("\n[6] Au sein d'un étage, la tête prime — c'est l'appelant qui range");
  {
    const f: Fragment[] = [
      { etage: "savoir", source: "premier", texte: texte(1500) },
      { etage: "savoir", source: "second", texte: texte(1500) },
    ];
    // Budget savoir = 2500 : le premier passe, le second déborde.
    const a = arbitre(f, { compte: parCaractere });
    check("le premier fragment est gardé", a.retenus.some((r) => r.source === "premier"));
    check("le second est écarté", !a.retenus.some((r) => r.source === "second"));
    // L'arbitre n'a aucun moyen de juger la pertinence d'un texte : c'est
    // l'appelant qui a rangé, et le test le grave pour que ça reste explicite.
    check("l'arbitre n'invente pas de pertinence — il respecte l'ordre reçu", a.coupes[0].source === "second");
  }

  console.log("\n[7] Le budget par défaut est bien celui du doc 05");
  {
    check("① Identité 2000", BUDGET_DEFAUT.identite === 2000);
    check("② Goût 1500", BUDGET_DEFAUT.gout === 1500);
    check("③ Projet 2000", BUDGET_DEFAUT.projet === 2000);
    check("④ Savoir 2500", BUDGET_DEFAUT.savoir === 2500);
    const total = BUDGET_DEFAUT.identite + BUDGET_DEFAUT.gout + BUDGET_DEFAUT.projet + BUDGET_DEFAUT.savoir;
    check("total 8000 tokens", total === 8000);
  }

  console.log("\n[8] recall() — la porte unique, sur des lectures injectées");
  {
    const r = await recall(
      { workspaceDir: "/ws", projectDir: "/ws/projet" },
      "écris un composant Panier",
      {
        compte: parCaractere,
        lectures: {
          axiomes: () => "AXIOME : toujours du français",
          preferences: () => "PRÉFÉRENCE : interfaces sobres",
          memoireProjet: () => "PROJET : panier en cours",
          lexique: () => "LEXIQUE : panier = cart",
          procedures: async () => "PROCÉDURE : crud localStorage",
        },
      },
    );

    const sources = r.souvenirs.map((s) => s.source);
    check("l'Identité remonte", sources.includes(".axioms.md") && sources.includes(".preferences.md"));
    check("le Projet remonte", sources.includes(".memory.md"));
    check("le Savoir remonte", sources.includes(".lexique.md") && sources.includes(".procedures/"));
    check("le texte prêt à injecter est composé", r.texte.includes("AXIOME") && r.texte.includes("PROCÉDURE"));
    check("l'arbitrage est rendu avec le résultat", r.arbitrage.tokensRetenus > 0);

    // L'ordre des étages est celui du doc 03/05 : Identité, Goût, Projet, Savoir.
    const iId = sources.indexOf(".axioms.md");
    const iProj = sources.indexOf(".memory.md");
    const iSav = sources.indexOf(".lexique.md");
    check("l'ordre des étages est respecté (identité < projet < savoir)", iId < iProj && iProj < iSav);
  }

  console.log("\n[9] recall() ne fait JAMAIS échouer un tour");
  {
    // La mémoire est un confort de contexte. Un magasin qui explose ne doit pas
    // emporter un tour qui aurait abouti sans lui — même garantie que `dispatch`.
    const r = await recall({ workspaceDir: "/ws" }, "tâche", {
      compte: parCaractere,
      lectures: {
        axiomes: () => { throw new Error("magasin corrompu"); },
        preferences: () => "PRÉFÉRENCE : survit",
        procedures: async () => { throw new Error("embeddings HS"); },
      },
    });
    check("un magasin qui lève n'interrompt pas le rappel", r.souvenirs.length > 0);
    check("les magasins sains remontent quand même", r.texte.includes("survit"));

    const vide = await recall({ workspaceDir: "/ws" }, "tâche", { compte: parCaractere, lectures: {} });
    check("aucune lecture → résultat vide, pas d'exception", vide.souvenirs.length === 0 && vide.texte === "");
  }

  console.log("\n[10] ② Goût est éteint, et il le dit");
  {
    // Il n'a aucune lecture câblée. Un étage vide qu'on croit allumé est un étage
    // dont on ne remarque jamais l'absence — c'est précisément ce qui est arrivé
    // aux axiomes pendant deux mois.
    const r = await recall({ workspaceDir: "/ws", tacheVisuelle: true }, "rends ça beau", {
      compte: parCaractere,
      lectures: { axiomes: () => "AXIOME" },
    });
    check("aucun souvenir de Goût ne remonte, même sur tâche visuelle", !r.souvenirs.some((s) => s.etage === "gout"));
  }

  console.log(`\n${fail === 0 ? "✅" : "❌"} memory-recall : ${pass} pass, ${fail} fail`);
  if (fail > 0) process.exit(1);
}

run().catch((err) => {
  console.error("échec inattendu :", err);
  process.exit(1);
});
