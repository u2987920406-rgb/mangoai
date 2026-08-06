// Le PARCOURS COMPLET de bout en bout, à travers les équipes (refonte v3, lot 3).
//
// C'est le dernier critère d'achèvement du lot 3 qui ne dépende pas de l'arbitrage
// resté ouvert entre `brain.ts` et `v3/` : « un parcours complet de bout en bout
// tourne ». Il tourne ici — déterministe, zéro réseau, transport injecté.
//
// Ce que ce fichier garde, et que `test-v3-teams` ne peut pas garder : les invariants
// qui ne sont VRAIS QU'EN SÉQUENCE. Une équipe correcte prise isolément peut être
// appelée dans le mauvais ordre, avec le mauvais cerveau, ou pas du tout.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { runTour, TeamBudget, TeamJournal, TEAMS } from "../v3/index.js";
import { resetRateLimits } from "../brain/brain-dispatch.js";
import { saveBrainRegistry, DEFAULT_REGISTRY } from "../brain/brain-registry.js";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "mango-v3-parcours-"));
const REG = path.join(TMP, "brain-registry.json");
process.env.BRAIN_REGISTRY_FILE = REG;

const noSleep = async () => { /* pas de backoff en test */ };
const mango = (s: string) =>
  `<<<MANGO>>>{"status":"ok","summary":"${s}","data":{},"confidence":0.9}<<<END>>>`;

/** Transport espion : note chaque appel (cerveau réellement employé + system + user)
 *  et répond en contrat Mango. C'est ce qui permet d'affirmer QUI a parlé, plutôt
 *  que de le déduire de l'ordre des équipes. */
function espion() {
  const appels: Array<{ system: string; user: string; modele: string }> = [];
  const ask = async (system: string, user: string, o: { model?: string }) => {
    appels.push({ system, user, modele: o?.model ?? "" });
    // Le libellé d'équipe est en tête du system : on le renvoie pour tracer la chaîne.
    const equipe = system.match(/Tu es l'équipe .+? (\S.*?)\.\n/)?.[1] ?? "?";
    return mango(`rapport de ${equipe}`);
  };
  return { appels, ask };
}

async function run() {
  // Registre déterministe : un modèle DIFFÉRENT par rôle, pour pouvoir prouver
  // lequel a réellement parlé. Le choix des noms est arbitraire — c'est la
  // DISTINCTION qui est testée, jamais la hiérarchie des modèles.
  const reg = { ...DEFAULT_REGISTRY };
  for (const id of Object.keys(reg) as Array<keyof typeof reg>) {
    reg[id] = { ...reg[id], provider: "ollama", model: `modele-${id}`, localOnly: false };
  }
  saveBrainRegistry(reg);
  resetRateLimits();

  console.log("\n[1] Un parcours de CONSTRUCTION — toutes les équipes s'enchaînent");
  {
    const { appels, ask } = espion();
    const journal = new TeamJournal(() => 0);
    const t = await runTour(
      "Regarde la maquette jointe, planifie et écris le composant Panier, puis rends-le beau.",
      {
        ceiling: "mutation",
        context: { hasAttachment: true },
        journal,
        budget: new TeamBudget(),
        // Étage 3 neutralisé : un routeur LLM rendrait le test non déterministe.
        // Les étages 1+2 suffisent à allumer tout le monde sur cette phrase.
        dispatch: async () => ({ status: "error", agent: "orchestrateur", summary: "", data: {}, confidence: 0, durationMs: 0 }),
        dispatchOpts: { ask, sleep: noSleep },
      },
    );

    check("le tour aboutit sans exception", t.resultats.length > 0);
    check("🧭 Orchestrateur est allumé", t.equipes.includes("orchestrateur"));
    check("🔨 Construction est allumée (la demande dit « écris »)", t.equipes.includes("construction"));
    check("🎨 Design est allumée (la demande dit « rends-le beau »)", t.equipes.includes("design"));
    check("👁️ Vision est allumée (une pièce jointe est présente)", t.equipes.includes("vision"));

    // L'ordre d'EXÉCUTION, pas seulement l'ordre de la liste : c'est ce qui distingue
    // ce test du précédent. Une équipe peut être bien déclarée et mal appelée.
    const ordreExecute = t.resultats.map((r) => r.teamId);
    check("🛡️ Vérification s'exécute en DERNIER (deux fois : audit puis verdict)",
      ordreExecute[ordreExecute.length - 1] === "verification" && ordreExecute[ordreExecute.length - 2] === "verification");
    check("🔨 Construction s'exécute AVANT la clôture",
      ordreExecute.indexOf("construction") < ordreExecute.indexOf("verification"));
    check("🎨 Design s'exécute APRÈS la Construction (on embellit ce qui existe)",
      ordreExecute.indexOf("design") > ordreExecute.indexOf("construction"));

    // Le verdict vient du JUGE, sur un cerveau distinct du codeur. C'est l'invariant
    // « non négociable » — ici prouvé EMPRUNTÉ, pas seulement déclaré au registre.
    check("le verdict est rendu par le rôle `juge`", t.verdict.agent === "juge");
    const modeleJuge = appels[appels.length - 1].modele;
    const modeleCodeur = appels.find((a) => a.system.includes("Construction"))?.modele;
    check(`le juge a RÉELLEMENT parlé sur un autre cerveau que le codeur (${modeleJuge} ≠ ${modeleCodeur})`,
      Boolean(modeleJuge) && Boolean(modeleCodeur) && modeleJuge !== modeleCodeur);
    check("le juge n'est pas non plus l'auditeur qui l'héberge",
      t.resultats.at(-2)?.agent === "auditeur" && t.verdict.agent === "juge");

    // La chaîne de contexte : chaque équipe voit ce que les précédentes ont rapporté,
    // et la demande d'origine n'est JAMAIS écrasée.
    const dernierUser = appels[appels.length - 1].user;
    check("la demande d'origine survit jusqu'au verdict", dernierUser.includes("composant Panier"));
    check("le verdict voit le rapport des équipes amont", dernierUser.includes("Ce que les équipes précédentes ont rapporté"));
    check("le premier appel ne contient AUCUN amont (rien ne précède)", !appels[0].user.includes("équipes précédentes"));

    // Chaque équipe n'a reçu que SA mission — sinon `dispatchTeam` ne serait qu'un
    // alias de `dispatch` avec un nom plus joli.
    const missions = appels.map((a) => a.system.match(/Mission : (.+)/)?.[1] ?? "");
    check("chaque appel porte la mission de SON équipe", missions.every((m) => m.length > 0) && new Set(missions).size >= 5);
  }

  console.log("\n[2] Le bandeau de statut — ce que l'utilisateur voit du tour");
  {
    const { ask } = espion();
    const journal = new TeamJournal(() => 0);
    await runTour("écris un composant Panier", {
      ceiling: "mutation",
      journal,
      budget: new TeamBudget(),
      dispatch: async () => ({ status: "error", agent: "orchestrateur", summary: "", data: {}, confidence: 0, durationMs: 0 }),
      dispatchOpts: { ask, sleep: noSleep },
    });

    const lignes = journal.lignes();
    check("le bandeau a des lignes", lignes.length > 0);
    check("chaque allumage a son extinction (aucune équipe laissée allumée)", journal.allumees().length === 0);
    check("le bandeau n'affiche aucune « pressentie » sur un tour RÉELLEMENT exécuté",
      lignes.every((l) => l.etat !== "pressentie"));
    check("le bandeau porte un détail lisible par un humain",
      lignes.some((l) => l.detail.includes("verdict d'adéquation")));

    // Ce que le doc 03 § 6 montre : une ligne par équipe, dans l'ordre.
    const vues = lignes.filter((l) => l.etat === "allumee").map((l) => l.teamId);
    check("l'ordre du bandeau suit l'ordre d'exécution", vues[0] === "orchestrateur" && vues[vues.length - 1] === "verification");
  }

  console.log("\n[3] Ce qui doit tenir quand ça se passe MAL");
  {
    // Une équipe en échec ne doit pas emporter le tour : la 🛡️ Vérification doit
    // pouvoir DIRE que ça s'est mal passé, ce qu'elle ne pourrait pas faire si
    // l'échec avait arrêté le parcours avant elle.
    const journal = new TeamJournal(() => 0);
    let n = 0;
    const askCasse = async (system: string) => {
      n++;
      if (system.includes("Construction")) throw new Error("cerveau injoignable");
      return mango("ok");
    };
    const t = await runTour("écris un composant Panier", {
      ceiling: "mutation",
      journal,
      budget: new TeamBudget(),
      dispatch: async () => ({ status: "error", agent: "orchestrateur", summary: "", data: {}, confidence: 0, durationMs: 0 }),
      dispatchOpts: { ask: askCasse, sleep: noSleep },
    });

    const constr = t.resultats.find((r) => r.teamId === "construction");
    check("l'équipe en panne rend un résultat dégradé, pas une exception", constr?.status === "error");
    check("le tour CONTINUE malgré la panne", t.resultats.length > 1);
    check("🛡️ Vérification a quand même tourné — c'est tout l'intérêt", t.verdict.agent === "juge");
    check("le journal marque un ÉCHEC, pas une extinction propre",
      journal.lignes().some((l) => l.teamId === "construction" && l.etat === "echec"));
    check("aucune équipe ne reste allumée après une panne", journal.allumees().length === 0);

    // Budget épuisé : extinction propre, le tour aboutit quand même.
    const b = new TeamBudget();
    for (let i = 0; i < TEAMS.construction.maxTours; i++) b.reserve("construction");
    const { ask } = espion();
    const t2 = await runTour("écris un composant Panier", {
      ceiling: "mutation",
      journal: new TeamJournal(() => 0),
      budget: b,
      dispatch: async () => ({ status: "error", agent: "orchestrateur", summary: "", data: {}, confidence: 0, durationMs: 0 }),
      dispatchOpts: { ask, sleep: noSleep },
    });
    const c2 = t2.resultats.find((r) => r.teamId === "construction");
    check("budget de 🔨 Construction épuisé → refus propre, le tour aboutit", c2?.refuse === true && t2.verdict.agent === "juge");

    // Le plafond est par TOUR. Sans budget neuf par défaut, `runTour` réutilisait le
    // budget du PROCESSUS : le deuxième tour d'une session trouvait tout épuisé et
    // refusait chaque équipe. Deux tours d'affilée, sans rien injecter.
    const opts2 = {
      ceiling: "mutation" as const,
      journal: new TeamJournal(() => 0),
      dispatch: async () => ({ status: "error" as const, agent: "orchestrateur" as const, summary: "", data: {}, confidence: 0, durationMs: 0 }),
      dispatchOpts: { ask, sleep: noSleep },
    };
    const tourA = await runTour("écris un composant Panier", opts2);
    const tourB = await runTour("écris un composant Panier", opts2);
    check("deux tours consécutifs aboutissent tous les deux (budget NEUF par tour)",
      tourA.resultats.every((r) => !r.refuse) && tourB.resultats.every((r) => !r.refuse));
  }

  console.log("\n[4] Le plafond de mutation traverse tout le tour");
  {
    // Sous `read-only`, AUCUNE équipe du tour ne peut manier un outil mutant. Le
    // plafond est l'axe SÛRETÉ : il ne se négocie pas équipe par équipe.
    const { ask } = espion();
    const t = await runTour("écris un composant Panier et rends-le beau", {
      ceiling: "read-only",
      journal: new TeamJournal(() => 0),
      budget: new TeamBudget(),
      dispatch: async () => ({ status: "error", agent: "orchestrateur", summary: "", data: {}, confidence: 0, durationMs: 0 }),
      dispatchOpts: { ask, sleep: noSleep },
    });
    const mutants = ["write_file", "edit_file", "run_command", "add_dependency", "genere_image", "ecris_test"];
    const fuites = t.resultats.flatMap((r) => (r.toolPolicy.allowedTools ?? []).filter((n) => mutants.includes(n)));
    check(`aucun outil mutant offert sous plafond read-only (fuites : ${fuites.join(", ") || "aucune"})`, fuites.length === 0);
    check("read_file reste offert (lire ne mute rien)",
      t.resultats.some((r) => (r.toolPolicy.allowedTools ?? []).includes("read_file")));
    check("le défaut est read-only, pas mutation (l'appelant distrait n'écrit pas)",
      (await runTour("écris un composant", {
        journal: new TeamJournal(() => 0),
        budget: new TeamBudget(),
        dispatch: async () => ({ status: "error", agent: "orchestrateur", summary: "", data: {}, confidence: 0, durationMs: 0 }),
        dispatchOpts: { ask, sleep: noSleep },
      })).resultats.every((r) => !(r.toolPolicy.allowedTools ?? []).includes("write_file")));
  }

  console.log(`\n${fail === 0 ? "✅" : "❌"} v3-parcours : ${pass} pass, ${fail} fail`);
  if (fail > 0) process.exit(1);
}

run().catch((err) => {
  console.error("échec inattendu :", err);
  process.exit(1);
});
