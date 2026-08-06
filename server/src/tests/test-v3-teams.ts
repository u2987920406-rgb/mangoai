// Tests du socle v3 — LES ÉQUIPES (refonte v3, lot 3).
//
// Déterministe, zéro réseau : `BRAIN_REGISTRY_FILE` pointe vers un fichier temporaire
// et le transport `ask` est injecté. Aucun test ci-dessous ne dépend de l'horloge
// réelle ni du registre vivant — sauf UN, explicitement, et il est marqué.
//
// Ce que ce fichier garde vraiment, au-delà des assertions de forme :
//   · qu'AUCUN outil du produit ne devienne injoignable (exigence littérale du lot 3 :
//     « aucune capacité perdue — les 41 outils restent joignables ») ;
//   · qu'aucun outil n'appartienne à deux équipes — c'est le retour du fourre-tout ;
//   · qu'aucun rôle du registre ne reste sans équipe, et réciproquement ;
//   · que 🛡️ Vérification s'allume à CHAQUE tour, en dernier, sans moyen de l'éteindre.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  TEAMS,
  TEAM_IDS,
  getTeam,
  teamCapabilities,
  teamOwningTool,
  outilsOrphelins,
  outilsFantomes,
  dispatchTeam,
  teamToolPolicy,
  TeamBudget,
  allumageSync,
  equipesAllumees,
  equipesPourCapacites,
  observeAllumage,
  capacitesSansEquipe,
  TeamJournal,
} from "../v3/index.js";
import { AGENT_IDS, type AgentId } from "../brain/brain-registry.js";
import {
  TOOL_CAPABILITIES,
  type Capability,
} from "../eleve-tools/eleve-tool-capabilities.js";
import { resetRateLimits } from "../brain/brain-dispatch.js";
import { applyToolPolicy } from "../eleve-tools/eleve-action-tools.js";
import { ToolRegistry } from "../kernel/kernel-mcp.js";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "mango-v3-teams-"));
process.env.BRAIN_REGISTRY_FILE = path.join(TMP, "brain-registry.json");

const okJson = (s = "fait") =>
  `<<<MANGO>>>{"status":"ok","summary":"${s}","data":{},"confidence":0.9}<<<END>>>`;
const noSleep = async () => { /* pas de backoff en test */ };

async function run() {
  console.log("\n[1] Le catalogue : 7 équipes, 7 cerveaux, aucun rôle orphelin");
  {
    // 7 et NON 8 : `extracteur` a été retiré du registre au lot 3, donc l'équipe
    // 📄 Extraction du doc 03 n'a plus de cerveau. Ses 3 compétences sont réaffectées
    // (Recherche + Vision), pas perdues — c'est ce que prouve le bloc [2].
    check("7 équipes déclarées (doc 03 moins 📄 Extraction, sans cerveau depuis le lot 3)", TEAM_IDS.length === 7);

    // Chaque équipe pointe sur un rôle qui EXISTE. Une équipe dont le cerveau n'est
    // pas au registre ne dispatche rien : elle tombe sur le défaut d'un autre rôle.
    const cerveauxInconnus = TEAM_IDS.filter((id) => !AGENT_IDS.includes(TEAMS[id].brain));
    check(`chaque équipe a un cerveau du registre (inconnus : ${cerveauxInconnus.join(", ") || "aucun"})`, cerveauxInconnus.length === 0);

    // Et RÉCIPROQUEMENT : aucun rôle du registre ne reste sans équipe. Sans cette
    // seconde assertion, on pourrait retirer une équipe et laisser son rôle traîner —
    // exactement le genre de vestige que la refonte supprime.
    const utilises = new Set<string>();
    for (const id of TEAM_IDS) {
      utilises.add(TEAMS[id].brain);
      if (TEAMS[id].brainInterne) utilises.add(TEAMS[id].brainInterne!);
    }
    const rolesOrphelins = AGENT_IDS.filter((a) => !utilises.has(a));
    check(`aucun rôle du registre sans équipe (orphelins : ${rolesOrphelins.join(", ") || "aucun"})`, rolesOrphelins.length === 0);
    check("les 8 rôles sont couverts par 7 équipes (le juge est INTERNE à la Vérification)", utilises.size === 8);

    check("🛡️ Vérification a un cerveau interne, et c'est le juge", TEAMS.verification.brainInterne === "juge");
    check("🛡️ Vérification : le juge est DISTINCT de l'auditeur qui l'héberge", TEAMS.verification.brain !== TEAMS.verification.brainInterne);
    check("🧭 Orchestrateur n'a AUCUN outil — il délègue, il n'exécute pas", TEAMS.orchestrateur.outils.length === 0);
    check("getTeam('inexistante') → undefined, pas d'exception", getTeam("inexistante") === undefined);
  }

  console.log("\n[2] Aucune capacité perdue — l'exigence littérale du lot 3");
  {
    const orphelins = outilsOrphelins();
    check(`aucun outil du produit sans équipe (orphelins : ${orphelins.join(", ") || "aucun"})`, orphelins.length === 0);

    const fantomes = outilsFantomes();
    check(`aucune équipe ne déclare un outil inexistant (fantômes : ${fantomes.join(", ") || "aucun"})`, fantomes.length === 0);

    // Un outil, une équipe. Deux propriétaires = personne ne sait qui répond.
    const vus = new Map<string, string>();
    const doublons: string[] = [];
    for (const id of TEAM_IDS) {
      for (const nom of TEAMS[id].outils) {
        if (vus.has(nom)) doublons.push(`${nom} (${vus.get(nom)} + ${id})`);
        else vus.set(nom, id);
      }
    }
    check(`aucun outil partagé entre deux équipes (doublons : ${doublons.join(", ") || "aucun"})`, doublons.length === 0);

    // Le compte, affiché : c'est la mesure que le lot 3 demande d'inscrire.
    console.log(`     → ${TOOL_CAPABILITIES.size} outils connus, ${vus.size} affectés à une équipe`);
    check("tous les outils connus sont affectés (compte à compte)", vus.size === TOOL_CAPABILITIES.size);

    // Les 3 compétences de l'ex-📄 Extraction sont bien retombées quelque part.
    check("ex-Extraction : lire_document → 🔎 Recherche", teamOwningTool("lire_document")?.id === "recherche");
    check("ex-Extraction : lire_archive → 🔎 Recherche", teamOwningTool("lire_archive")?.id === "recherche");
    check("ex-Extraction : decoupe_assets → 👁️ Vision", teamOwningTool("decoupe_assets")?.id === "vision");

    // La capacité est DÉRIVÉE des outils, pas déclarée deux fois.
    check("capacités dérivées : 🎨 Design possède content-gen (genere_contenu)", teamCapabilities(TEAMS.design).has("content-gen"));
    check("capacités dérivées : 🔨 Construction possède write-fs et run-cmd", teamCapabilities(TEAMS.construction).has("write-fs") && teamCapabilities(TEAMS.construction).has("run-cmd"));
    check("capacités dérivées : 🧭 Orchestrateur n'en a AUCUNE", teamCapabilities(TEAMS.orchestrateur).size === 0);

    // `delegate` est la seule capacité sans porteur, et c'est documenté comme réservé.
    const toutes = new Set<Capability>();
    for (const c of TOOL_CAPABILITIES.values()) toutes.add(c.capability);
    const sansEquipe = capacitesSansEquipe(toutes);
    check(`seule "delegate" (réservée) reste sans équipe — trouvé : ${sansEquipe.join(", ") || "aucune"}`, sansEquipe.length === 0);
  }

  console.log("\n[3] L'allumage : déterministe, et la Vérification non désactivable");
  {
    // Étages 1+2 seuls : purs, synchrones, zéro appel modèle.
    const vide = allumageSync("");
    check("🧭 Orchestrateur s'allume TOUJOURS, même sur une tâche vide", vide.includes("orchestrateur"));
    check("🛡️ Vérification s'allume TOUJOURS, même sur une tâche vide", vide.includes("verification"));
    check("🛡️ Vérification est TOUJOURS en dernier (elle vérifie ce que les autres ont produit)", vide[vide.length - 1] === "verification");

    // Aucun jeu de capacités, si pauvre soit-il, ne l'éteint. C'est la promesse produit :
    // « toujours, à la clôture de chaque tour. Non désactivable. » (doc 03 § 2)
    const jamaisEteinte = [
      new Set<Capability>(),
      new Set<Capability>(["read-local"]),
      new Set<Capability>(["vision", "write-fs", "plan", "test"]),
    ].every((c) => equipesPourCapacites(c).includes("verification"));
    check("aucun ensemble de capacités n'éteint 🛡️ Vérification", jamaisEteinte);

    // Déterminisme : même entrée, même sortie. Un allumage aléatoire serait indébogable.
    const a = allumageSync("écris un composant Panier en React");
    const b = allumageSync("écris un composant Panier en React");
    check("même message → même allumage (déterministe)", JSON.stringify(a) === JSON.stringify(b));

    // Traduction capacité → équipe, cas par cas.
    check("vision → 👁️ Vision allumée", equipesPourCapacites(new Set<Capability>(["vision"])).includes("vision"));
    check("media-gen → 🎨 Design allumée", equipesPourCapacites(new Set<Capability>(["media-gen"])).includes("design"));
    check("read-web → 🔎 Recherche allumée", equipesPourCapacites(new Set<Capability>(["read-web"])).includes("recherche"));

    // ── Le point que `test-v3-parcours` a fait remonter, gardé ici pour de bon ──
    // L'escalier de capacités ne produit JAMAIS `write-fs` ni `plan` : ce sont des
    // capacités de mutation, et l'axe mutation est celui de la POSTURE (#182 D1).
    // Allumer 🔨 Construction ou 🧠 Analyse dessus revenait à ne jamais les allumer.
    check("write-fs ne suffit PAS à allumer 🔨 Construction (l'escalier ne l'émet jamais)",
      !equipesAllumees(new Set<Capability>(["write-fs"]), "read-only").includes("construction"));
    check("plan ne suffit PAS à allumer 🧠 Analyse (même raison)",
      !equipesAllumees(new Set<Capability>(["plan"]), "read-only").includes("analyse"));
    check("plafond `mutation` → 🔨 Construction ET 🧠 Analyse allumées, sans aucune capacité",
      equipesAllumees(new Set<Capability>(), "mutation").includes("construction")
      && equipesAllumees(new Set<Capability>(), "mutation").includes("analyse"));

    // 🔨 Construction s'allume AUSSI en lecture : elle possède les quatre lecteurs du
    // projet et personne d'autre ne les a. Sans ça, « que fait ce fichier ? » ne
    // trouvait personne pour répondre sous plafond read-only.
    check("read-local → 🔨 Construction allumée (elle LIT le projet)",
      equipesPourCapacites(new Set<Capability>(["read-local"])).includes("construction"));
    check("read-local SEUL n'allume PAS 🎨 Design (lire n'est pas embellir)",
      !equipesPourCapacites(new Set<Capability>(["read-local"])).includes("design"));

    // L'ordre du bandeau suit le schéma du doc 03 § 3, de haut en bas.
    const tout = equipesAllumees(new Set<Capability>(["read-web", "vision", "media-gen"]), "mutation");
    check("ordre du bandeau : Orchestrateur → Analyse → Recherche → Vision → Construction → Design → Vérification",
      JSON.stringify(tout) === JSON.stringify(["orchestrateur", "analyse", "recherche", "vision", "construction", "design", "verification"]));
  }

  console.log("\n[4] Le périmètre d'outils : l'équipe ne manie QUE les siens");
  {
    // Sous plafond `mutation`, une équipe a exactement ses outils déclarés.
    const constr = teamToolPolicy(TEAMS.construction, "mutation");
    check("🔨 Construction (mutation) : allowlist = ses outils déclarés", (constr.allowedTools ?? []).length === TEAMS.construction.outils.length);
    check("🔨 Construction (mutation) : allowRun est vrai (elle possède run_command)", constr.allowRun === true);

    // Le plafond read-only écarte les MUTANTS, même quand l'équipe les possède.
    // C'est l'axe SÛRETÉ, orthogonal à l'appartenance : il ne se négocie pas.
    const constrRO = teamToolPolicy(TEAMS.construction, "read-only");
    const a = constrRO.allowedTools ?? [];
    check("🔨 Construction (read-only) : write_file écarté par le plafond", !a.includes("write_file"));
    check("🔨 Construction (read-only) : run_command écarté par le plafond", !a.includes("run_command"));
    check("🔨 Construction (read-only) : read_file conservé (lire ne mute rien)", a.includes("read_file"));
    check("🔨 Construction (read-only) : allowRun est faux", constrRO.allowRun === false);

    // Le point qui justifie la déclaration nommée des outils : `verifie_design` est
    // classé `read-local`. Déduire les outils des capacités aurait donné à 🎨 Design
    // TOUS les outils read-local du produit (read_file, list_files, check_build…).
    const design = teamToolPolicy(TEAMS.design, "read-only");
    const ad = design.allowedTools ?? [];
    check("🎨 Design : verifie_design présent (il est à elle)", ad.includes("verifie_design"));
    check("🎨 Design n'hérite PAS de read_file bien qu'il partage la capacité read-local", !ad.includes("read_file"));
    check("🎨 Design (read-only) : genere_image écarté (mutant)", !ad.includes("genere_image"));

    // ⚠️ Le piège de l'allowlist vide : `applyToolPolicy` la traite comme « aucun
    // filtre ». Sans denylist explicite, 🧭 Orchestrateur — qui n'a AUCUN outil —
    // aurait reçu le registre entier. C'est le contraire exact de ce qu'il doit avoir.
    {
      const orch = teamToolPolicy(TEAMS.orchestrateur, "mutation");
      check("🧭 Orchestrateur : allowlist vide", (orch.allowedTools ?? []).length === 0);
      check("🧭 Orchestrateur : denylist EXPLICITE de tout le registre (sinon il aurait tout)",
        (orch.deniedTools ?? []).length === TOOL_CAPABILITIES.size);
      const reg = new ToolRegistry();
      for (const nom of ["read_file", "write_file", "run_command"]) {
        reg.register({ name: nom, description: "", inputSchema: {}, handler: async () => ({ text: "" }) });
      }
      check("appliqué à un vrai registre, il ne reste RIEN à l'Orchestrateur",
        applyToolPolicy(reg, orch).list().length === 0);
    }

    // La policy de l'appelant RESSERRE, elle n'élargit jamais. `mergePolicies` fait
    // primer l'appelant sur `allowRun` — sémantique juste pour un sous-agent scellé,
    // fausse ici : elle rendrait le shell à une équipe à qui le plafond read-only vient
    // de le retirer. `dispatchTeam` ET les deux.
    check("un appelant ne peut PAS rendre allowRun à une équipe sous plafond read-only",
      (await dispatchTeam("construction", "s", "u", {
        ask: async () => okJson(), sleep: noSleep, budget: new TeamBudget(), journal: new TeamJournal(),
        ceiling: "read-only", policy: { allowRun: true },
      })).toolPolicy.allowRun === false);
    check("un appelant peut RETIRER allowRun à une équipe qui l'avait",
      (await dispatchTeam("construction", "s", "u", {
        ask: async () => okJson(), sleep: noSleep, budget: new TeamBudget(), journal: new TeamJournal(),
        ceiling: "mutation", policy: { allowRun: false },
      })).toolPolicy.allowRun === false);

    // 🛡️ Vérification : lance_tests survit au plafond read-only (il rejoue, il n'écrit pas),
    // ecris_test non. La distinction vient de TOOL_CAPABILITIES, pas d'ici.
    const verif = teamToolPolicy(TEAMS.verification, "read-only");
    const av = verif.allowedTools ?? [];
    check("🛡️ Vérification (read-only) : lance_tests conservé, ecris_test écarté", av.includes("lance_tests") && !av.includes("ecris_test"));
  }

  console.log("\n[5] Le journal d'allumage — la seule chose que l'utilisateur voit");
  {
    // Horloge injectée : un test qui dépend de Date.now() est un test instable.
    let t = 1000;
    const j = new TeamJournal(() => t);

    j.allume("recherche", "lecture de cahier-des-charges.pdf");
    t = 4200;
    check("une équipe allumée est listée comme allumée", j.allumees().includes("recherche"));
    j.eteint("recherche", "3 sources retenues");
    check("une équipe éteinte ne l'est plus", !j.allumees().includes("recherche"));

    const l = j.lignes();
    check("2 lignes : un allumage, une extinction", l.length === 2);
    check("la durée est calculée à l'extinction (3200 ms)", l[1].dureeMs === 3200);
    check("l'extinction propre n'est pas un échec", l[1].etat === "eteinte");

    j.allume("construction", "étape 3/6");
    j.eteint("construction", "build cassé", true);
    check("un échec est distingué d'une extinction propre", j.lignes()[3].etat === "echec");

    // Ordre d'allumage préservé quand plusieurs équipes sont allumées ensemble.
    j.vide();
    t = 10;  j.allume("analyse");
    t = 20;  j.allume("construction");
    t = 30;  j.allume("design");
    check("allumees() rend l'ordre d'allumage", JSON.stringify(j.allumees()) === JSON.stringify(["analyse", "construction", "design"]));

    // Le journal est BORNÉ — sinon c'est une fuite mémoire sur une longue session.
    j.vide();
    for (let i = 0; i < 500; i++) { j.allume("construction"); j.eteint("construction"); }
    check(`journal borné (${j.lignes().length} lignes ≤ 200)`, j.lignes().length <= 200);

    // Copie défensive : un consommateur du bandeau ne réécrit pas le journal.
    const copie = j.lignes() as unknown as unknown[];
    const avant = j.lignes().length;
    copie.push({});
    check("lignes() rend une COPIE (le bandeau ne peut pas écrire dans le journal)", j.lignes().length === avant);
  }

  console.log("\n[6] dispatchTeam : mission injectée, budget borné, refus propres");
  {
    resetRateLimits();
    const budget = new TeamBudget();
    const journal = new TeamJournal();

    // La MISSION de l'équipe est préfixée au system de l'appelant. Sans ça,
    // `dispatchTeam` ne serait qu'un alias de `dispatch` avec un plus joli nom.
    let systemVu = "";
    const ask = async (system: string) => { systemVu = system; return okJson(); };
    const r = await dispatchTeam("recherche", "Trouve trois sources.", "sujet X", { ask, sleep: noSleep, budget, journal });
    check("dispatchTeam rend un résultat ok", r.status === "ok" && r.refuse === false);
    check("le résultat porte l'identité de l'équipe", r.teamId === "recherche");
    check("la MISSION de l'équipe est injectée dans le system", systemVu.includes("Mission : Trouver, lire et rapporter"));
    check("le system de l'appelant est conservé", systemVu.includes("Trouve trois sources."));
    check("le contrat Mango est toujours injecté (dispatch inchangé)", systemVu.includes("RÈGLE ABSOLUE"));
    check("la policy appliquée est journalisée dans le résultat", (r.toolPolicy.allowedTools ?? []).length > 0);

    // Le journal a bien vu passer l'allumage ET l'extinction.
    const ids = journal.lignes().map((e) => `${e.teamId}:${e.etat}`);
    check("le journal a enregistré allumage puis extinction", JSON.stringify(ids) === JSON.stringify(["recherche:allumee", "recherche:eteinte"]));

    // Équipe inconnue → refus AVANT tout appel modèle. Pas d'exception, pas d'appel.
    let appels = 0;
    const askCompte = async () => { appels++; return okJson(); };
    const inconnue = await dispatchTeam("marketing", "s", "u", { ask: askCompte, sleep: noSleep, budget, journal });
    check("équipe inconnue → refus, sans exception", inconnue.refuse === true && inconnue.status === "error");
    check("équipe inconnue → AUCUN appel modèle", appels === 0);

    // Budget : dépassement = extinction PROPRE, jamais un blocage (doc 03 § 4).
    const b2 = new TeamBudget();
    const j2 = new TeamJournal();
    const max = TEAMS.analyse.maxTours;
    for (let i = 0; i < max; i++) {
      await dispatchTeam("analyse", "s", "u", { ask, sleep: noSleep, budget: b2, journal: j2 });
    }
    const apres = await dispatchTeam("analyse", "s", "u", { ask: askCompte, sleep: noSleep, budget: b2, journal: j2 });
    check(`budget de 🧠 Analyse épuisé après ${max} tours → refus`, apres.refuse === true);
    check("budget épuisé → extinction PROPRE, pas une exception", apres.status === "error" && apres.summary.includes("budget"));
    check("budget épuisé → aucun appel modèle supplémentaire", appels === 0);
    check("restant() tombe à 0 et n'est jamais négatif", b2.restant("analyse") === 0);
    b2.reset();
    check("reset() rend le budget (un nouveau tour utilisateur repart à neuf)", b2.restant("analyse") === max);

    // Cerveau interne : le juge de la 🛡️ Vérification, distinct de l'exécutant.
    const b3 = new TeamBudget();
    let agentVu = "";
    const askAgent = async (system: string, user: string) => { void system; void user; return okJson(); };
    const rj = await dispatchTeam("verification", "Juge.", "livraison", { ask: askAgent, sleep: noSleep, budget: b3, cerveau: "interne", journal: new TeamJournal() });
    agentVu = rj.agent;
    check("cerveau interne → le résultat porte le rôle `juge`, pas `auditeur`", agentVu === "juge");

    // Demander un cerveau interne à une équipe qui n'en a pas est une ERREUR d'appelant,
    // pas un repli silencieux sur le principal : un repli masquerait la faute.
    const sansInterne = await dispatchTeam("construction", "s", "u", { ask, sleep: noSleep, budget: new TeamBudget(), cerveau: "interne", journal: new TeamJournal() });
    check("cerveau interne demandé à une équipe qui n'en a pas → refus explicite", sansInterne.refuse === true);
  }

  console.log("\n[7] L'observation : le socle regarde le trafic réel sans y toucher");
  {
    // `observeAllumage` est le premier branchement du socle sur un chemin de production
    // (home-routes). Deux propriétés le rendent posable sans risque — et les deux sont
    // gardées ici, parce qu'elles sont exactement ce qui pourrait se perdre en silence.
    const j = new TeamJournal(() => 0);
    const caps = new Set<Capability>(["vision", "write-fs"]);
    const eq = observeAllumage(caps, "accueil", j);

    // 1. Elle décide comme l'allumage normal — sinon elle observerait autre chose que
    //    ce que le socle ferait, et sa mesure ne vaudrait rien.
    check("observeAllumage décide exactement comme equipesPourCapacites",
      JSON.stringify(eq) === JSON.stringify(equipesPourCapacites(caps)));

    // 2. Elle ne prétend PAS que le travail a eu lieu. Un bandeau qui ment est pire
    //    qu'un bandeau vide : l'utilisateur croirait la Construction passée.
    const etats = new Set(j.lignes().map((l) => l.etat));
    check("toutes les entrées sont « pressentie », aucune « allumee »", etats.size === 1 && etats.has("pressentie"));
    check("aucune équipe n'est réellement allumée après observation", j.allumees().length === 0);
    check("une pressentie n'ouvre aucune durée (rien ne commence, rien ne dure)", j.lignes().every((l) => l.dureeMs === undefined));
    check("le détail de contexte est conservé pour le bandeau", j.lignes()[0].detail === "accueil");
  }

  console.log("\n[8] Le registre VIVANT — la seule assertion qui lit le disque réel");
  {
    // Les blocs précédents tournent sur un registre temporaire (défauts). Celui-ci lit
    // le fichier qui S'EXÉCUTE : c'est le seul qui puisse attraper un registre livré
    // avec un rôle manquant. Il ne vérifie que la PRÉSENCE, jamais le choix de modèle —
    // le modèle est un arbitrage produit, pas un invariant de code.
    const vivant = path.join(import.meta.dirname, "..", "..", "data", "brain-registry.json");
    if (fs.existsSync(vivant)) {
      const r = JSON.parse(fs.readFileSync(vivant, "utf8")) as Record<string, unknown>;
      const manquants = TEAM_IDS
        .flatMap((id) => [TEAMS[id].brain, TEAMS[id].brainInterne])
        .filter((b): b is AgentId => b !== undefined)
        .filter((b) => !r[b]);
      check(`registre VIVANT : tout cerveau d'équipe y est présent (manquants : ${manquants.join(", ") || "aucun"})`, manquants.length === 0);
    } else {
      console.log("     (registre vivant absent — assertion sautée, les défauts s'appliquent)");
    }
  }

  console.log(`\n${fail === 0 ? "✅" : "❌"} v3-teams : ${pass} pass, ${fail} fail`);
  if (fail > 0) process.exit(1);
}

run().catch((err) => {
  console.error("échec inattendu :", err);
  process.exit(1);
});
