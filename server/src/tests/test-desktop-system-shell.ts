// #180 É6 — Preuve en situation réelle (règle ⭐⭐⭐) du palier système gaté
// (DESKTOP_SYSTEM_SHELL), des outils déterministes (open_url/open_folder/
// reveal_in_explorer) et de l'extension des entrées du Disjoncteur (D7).
// Les 4 scénarios demandés par le plan #180 É6 :
//   1. Palier OFF → run_command / registre inchangés (égalité stricte).
//   2. Palier ON + interactif → open_url fonctionne réellement ; commande
//      hors-famille approuvée → "approbation requise", jamais silencieux/exécuté.
//   3. Palier ON + autonome → refus systématique + signal breaker safe:false lu
//      par decideBreakerStop (arrêt à la frontière).
//   4. FORBIDDEN_RUN reste inviolable même palier ON + interactif.
import { flag } from "../flags.js";
import { runAsActor } from "../perimeter-context.js";
import { buildEleveToolRegistry } from "../eleve-tools/eleve-action-tools.js";
import {
  runSystemPaletteCommand,
  approveFamily,
  resetApprovedFamilies,
  matchFamily,
  needsApproval,
} from "../eleve-tools/eleve-system-tools.js";
import { listPerimeterIncidents, clearPerimeterIncidents, combineBreakerVerdict } from "../perimeter-incidents.js";
import { decideBreakerStop } from "../nocturnal.js";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

// ASYNC et AWAITÉ jusqu'au bout : un `finally` synchrone sur un `fn` async restaurerait
// l'env DÈS LE PREMIER `await` interne (le corps async suspend, `fn()` renvoie une
// promesse pendante, le `finally` s'exécute AVANT qu'elle ne se résolve) — bug piégeux
// qui aurait fait lire un gate déjà remis à sa valeur précédente aux étapes ultérieures
// du callback. `await fn()` DANS le try garantit que le `finally` attend la fin réelle.
async function withGate<T>(value: string | undefined, fn: () => T | Promise<T>): Promise<T> {
  const prev = process.env.DESKTOP_SYSTEM_SHELL;
  if (value === undefined) delete process.env.DESKTOP_SYSTEM_SHELL; else process.env.DESKTOP_SYSTEM_SHELL = value;
  try { return await fn(); }
  finally { if (prev === undefined) delete process.env.DESKTOP_SYSTEM_SHELL; else process.env.DESKTOP_SYSTEM_SHELL = prev; }
}

async function run() {
  console.log("─".repeat(64));
  console.log("test-desktop-system-shell (#180 É6 — preuve en situation réelle)");
  console.log("─".repeat(64));

  console.log("\n[1] Palier OFF → registre Élève BYTE-IDENTIQUE (aucun outil système)");
  await withGate(undefined, () => {
    const namesOff = buildEleveToolRegistry("/tmp/x").list().map((t) => t.name).sort();
    check("aucun des 4 outils du palier système n'est enregistré", !namesOff.includes("run_system_command") && !namesOff.includes("open_url") && !namesOff.includes("open_folder") && !namesOff.includes("reveal_in_explorer"));
  });
  await withGate("off", async () => {
    const namesExplicitOff = buildEleveToolRegistry("/tmp/x").list().map((t) => t.name).sort();
    const namesAbsent = await withGate(undefined, () => buildEleveToolRegistry("/tmp/x").list().map((t) => t.name).sort());
    check("gate absent VS gate=off : registre STRICTEMENT identique (égalité)", JSON.stringify(namesExplicitOff) === JSON.stringify(namesAbsent));
  });

  console.log("\n[2] Palier ON + registre : les 4 outils apparaissent");
  await withGate("on", () => {
    const names = buildEleveToolRegistry("/tmp/x").list().map((t) => t.name).sort();
    check("run_system_command enregistré", names.includes("run_system_command"));
    check("open_url enregistré", names.includes("open_url"));
    check("open_folder enregistré", names.includes("open_folder"));
    check("reveal_in_explorer enregistré", names.includes("reveal_in_explorer"));
  });

  console.log("\n[3] Palier ON + INTERACTIF : open_url ouvre réellement (spawn du navigateur système, exit propre)");
  await withGate("on", async () => {
    resetApprovedFamilies();
    const reg = buildEleveToolRegistry("/tmp/x");
    const openUrl = reg.get("open_url")!;
    const res = await runAsActor("interactive", () => openUrl.handler({ url: "https://example.com" }));
    check(`open_url (interactif) → succès mesurable (isError absent) — texte: "${res.text}"`, !res.isError);
  });

  console.log("\n[3bis] Palier ON + INTERACTIF : commande HORS-FAMILLE → 'approbation requise' (jamais silencieux, jamais exécuté)");
  await withGate("on", async () => {
    resetApprovedFamilies();
    check("précondition : 'notepad' n'appartient à aucune famille connue", matchFamily("notepad.exe") === undefined);
    const r = await runAsActor("interactive", () => runSystemPaletteCommand("notepad.exe"));
    check("commande hors-famille → refus explicite (isError), pas d'exécution", !r.ok && r.isError === true);
    check("message pédagogique (familles listées), pas un échec muet", r.text.length > 0 && /famille/i.test(r.text));

    // Famille CONNUE mais PAS approuvée cette session → message "approbation requise".
    check("précondition : 'node --version' matche la famille node-info", matchFamily("node --version")?.id === "node-info");
    check("précondition : la famille n'est pas encore approuvée", needsApproval("node-info", new Set()));
    const r2 = await runAsActor("interactive", () => runSystemPaletteCommand("node --version"));
    check("famille connue mais NON approuvée → 'approbation requise' (jamais exécuté)", !r2.ok && /[Aa]pprobation requise/.test(r2.text));

    // Après approbation explicite : la MÊME commande s'exécute.
    approveFamily("node-info");
    const r3 = await runAsActor("interactive", () => runSystemPaletteCommand("node --version"));
    check("après approbation de la famille → exécution réussie", r3.ok === true);
    resetApprovedFamilies();
  });

  console.log("\n[4] Palier ON + AUTONOME : refus INCONDITIONNEL + signal breaker safe:false lu par decideBreakerStop");
  await withGate("on", async () => {
    resetApprovedFamilies();
    clearPerimeterIncidents();
    approveFamily("node-info"); // même approuvée : ne doit RIEN changer en autonome
    const r = await runAsActor("autonomous", () => runSystemPaletteCommand("node --version"));
    check("acteur autonome → refus MÊME famille approuvée MÊME gate ON (fail-safe D4)", !r.ok && r.isError === true);

    const rUrl = await runAsActor("autonomous", () => {
      const openUrl = buildEleveToolRegistry("/tmp/x").get("open_url")!;
      return openUrl.handler({ url: "https://example.com" });
    });
    check("open_url refusé lui aussi en autonome", rUrl.isError === true);

    const incidents = listPerimeterIncidents();
    check(`au moins 2 incidents 'forbidden-command-autonomous' enregistrés (obtenu: ${incidents.length})`, incidents.filter((i) => i.kind === "forbidden-command-autonomous").length >= 2);

    const combined = combineBreakerVerdict({ available: false, reason: "absent" }, incidents);
    check("verdict combiné : safe:false (même sans fichier MangoQA présent)", combined.available && combined.safe === false);

    const stop = decideBreakerStop(true, () => combined);
    check("decideBreakerStop (nocturnal.ts, INCHANGÉ) déclenche bien l'arrêt à la frontière", stop.stop === true);
    check("la raison de l'arrêt cite le Disjoncteur (contrat existant préservé)", /Disjoncteur/.test(stop.reason ?? ""));

    clearPerimeterIncidents();
    resetApprovedFamilies();
  });

  console.log("\n[5] FORBIDDEN_RUN reste inviolable — gate ON, acteur INTERACTIF, commande de la blacklist existante");
  await withGate("on", async () => {
    resetApprovedFamilies();
    const r = await runAsActor("interactive", () => runSystemPaletteCommand("git status"));
    check("'git status' (blacklist FORBIDDEN_RUN) → toujours refusé, même palier ON + interactif", !r.ok && r.isError === true);
    check("motif explicite : plancher inviolable", /interdite|inviolable/i.test(r.text));
  });

  console.log(`\n${fail === 0 ? "✅" : "❌"} test-desktop-system-shell : ${pass} pass, ${fail} fail`);
  if (fail > 0) process.exit(1);
}

void run();
