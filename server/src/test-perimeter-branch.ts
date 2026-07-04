// #180 É2 — Test du BRANCHEMENT du noyau de périmètre dans les outils réels.
//
// Deux garanties, dans l'ordre de la discipline « revue Fable » :
//   (A) ÉGALITÉ STRICTE gate OFF — `confinePath` (le remplaçant unique des ~9
//       `resolveInside` locaux) est BYTE-IDENTIQUE à la barrière historique pour
//       une batterie de chemins (accept + toutes les formes de refus + message
//       d'erreur exact). Comme TOUS les sites délèguent à confinePath, prouver
//       confinePath OFF ≡ resolveInside prouve la non-régression de chaque site.
//   (B) Comportement gate ON — coffre granté : écriture hors-workspace OK en
//       `interactive`, ÉCHOUE proprement (message pédagogique, pas un crash) en
//       `autonomous`, et fail-safe → workspace-only si un garde-fou manque (D4).
//
// Bout-en-bout : on drive AUSSI le vrai `executeContract` (executor.ts) pour
// prouver que le chemin d'écriture RÉEL respecte le palier. Transport 0 réseau.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { confinePath, runAsActor } from "./perimeter-context.js";
import { executeContract } from "./executor.js";
import { GRANTS_FILE, saveGrants, type Grant } from "./perimeter.js";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}
function throws(fn: () => unknown): boolean {
  try { fn(); return false; } catch { return true; }
}

// La barrière HISTORIQUE (copie littérale du resolveInside canonique executor.ts),
// figée ici comme oracle d'égalité stricte.
function legacyResolveInside(projectDir: string, rel: string): string {
  const root = path.resolve(projectDir);
  const abs = path.resolve(root, rel);
  if (abs !== root && !abs.startsWith(root + path.sep)) {
    throw new Error(`chemin hors du projet : ${rel}`);
  }
  return abs;
}

/** Snapshot/restaure le registre de grants réel (data/desktop-grants.json) pour
 *  ne jamais laisser de trace après le test. */
function withGrants<T>(grants: Grant[], fn: () => T): T {
  const prev = fs.existsSync(GRANTS_FILE) ? fs.readFileSync(GRANTS_FILE) : null;
  try {
    saveGrants(grants, GRANTS_FILE);
    return fn();
  } finally {
    if (prev === null) { try { fs.unlinkSync(GRANTS_FILE); } catch { /**/ } }
    else fs.writeFileSync(GRANTS_FILE, prev);
  }
}

function setEnv(vars: Record<string, string | undefined>): Record<string, string | undefined> {
  const prev: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(vars)) {
    prev[k] = process.env[k];
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
  return prev;
}
function restoreEnv(prev: Record<string, string | undefined>): void {
  for (const [k, v] of Object.entries(prev)) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
}

const GATES3 = { MANGOQA_STOP_AUTHORITY: "on", NOCTURNAL_BUDGET_HARD: "on", NOCTURNAL_QA_BUS: "on" };

async function run() {
  console.log("─".repeat(64));
  console.log("test-perimeter-branch (#180 É2 — branchement dans les outils)");
  console.log("─".repeat(64));

  const WS = path.resolve(fs.mkdtempSync(path.join(os.tmpdir(), "perim-ws-")));
  const VAULT = path.resolve(fs.mkdtempSync(path.join(os.tmpdir(), "perim-vault-")));

  // La batterie d'égalité : accept variés + toutes les formes de refus.
  const CASES = [
    "a.txt", "src/App.jsx", "src/deep/nested/x.ts", ".", "./rel.md",
    "../evil.txt", "../../etc/passwd", "sub/../../out.txt", "sub/../ok.txt",
    path.join(VAULT, "outside.txt"), // chemin absolu HORS workspace
    "", "dir/",
  ];

  console.log("\n[A] ÉGALITÉ STRICTE gate OFF : confinePath ≡ resolveInside historique (chaque site)");
  {
    const prev = setEnv({ DESKTOP_PERIMETER: "off" });
    try {
      let allIdentical = true;
      for (const rel of CASES) {
        for (const access of ["read", "write"] as const) {
          const legThrew = throws(() => legacyResolveInside(WS, rel));
          const newThrew = throws(() => confinePath(WS, rel, access));
          if (legThrew !== newThrew) { allIdentical = false; console.log(`    ✗ divergence throw sur « ${rel} » (${access})`); continue; }
          if (!legThrew) {
            if (legacyResolveInside(WS, rel) !== confinePath(WS, rel, access)) { allIdentical = false; console.log(`    ✗ divergence valeur sur « ${rel} »`); }
          }
        }
      }
      check("chaque cas (accept + refus) est byte-identique en read ET write, gate OFF", allIdentical);
      // Message d'erreur EXACT (le préfixe des sites est « chemin hors du projet »).
      let msg = "";
      try { confinePath(WS, "../x", "write"); } catch (e) { msg = (e as Error).message; }
      check("message d'erreur OFF exact : « chemin hors du projet : ../x »", msg === "chemin hors du projet : ../x");
      // Le préfixe custom d'un site (au cas où un site en aurait un autre) est respecté.
      let msg2 = "";
      try { confinePath(WS, "../x", "read", "chemin hors du périmètre spécial"); } catch (e) { msg2 = (e as Error).message; }
      check("préfixe d'erreur custom OFF respecté (préservation par site)", msg2 === "chemin hors du périmètre spécial : ../x");
    } finally { restoreEnv(prev); }
  }

  console.log("\n[B] Gate ON sans coffre : workspace-only, résultats IDENTIQUES à OFF (aucun grant)");
  {
    const prev = setEnv({ DESKTOP_PERIMETER: "on" });
    try {
      withGrants([], () => runAsActor("interactive", () => {
        let same = true;
        for (const rel of CASES) {
          const offThrew = throws(() => legacyResolveInside(WS, rel));
          const onThrew = throws(() => confinePath(WS, rel, "write"));
          if (offThrew !== onThrew) same = false;
          else if (!offThrew && legacyResolveInside(WS, rel) !== confinePath(WS, rel, "write")) same = false;
        }
        check("ON + 0 coffre = workspace-only, accept/refus identiques à la barrière historique", same);
      }));
    } finally { restoreEnv(prev); }
  }

  const coffreFile = path.join(VAULT, "note.md");

  console.log("\n[C] Gate ON + coffre rw + INTERACTIF : écriture hors-workspace ACCEPTÉE");
  {
    const prev = setEnv({ DESKTOP_PERIMETER: "on", ...GATES3 });
    try {
      withGrants([{ path: VAULT, mode: "rw", ts: Date.now() }], () => runAsActor("interactive", () => {
        check("interactif : chemin dans le coffre rw résolu en ÉCRITURE", confinePath(WS, coffreFile, "write") === coffreFile);
        check("interactif : chemin dans le coffre résolu en LECTURE", confinePath(WS, coffreFile, "read") === coffreFile);
        check("interactif : workspace toujours accessible", confinePath(WS, "src/x.js", "write") === path.resolve(WS, "src/x.js"));
        check("interactif : chemin hors workspace ET hors coffre TOUJOURS refusé", throws(() => confinePath(WS, path.join(os.tmpdir(), "ailleurs.txt"), "write")));
      }));
    } finally { restoreEnv(prev); }
  }

  console.log("\n[D] Gate ON + coffre rw + AUTONOME (3 garde-fous armés) : lecture OK, ÉCRITURE refusée proprement");
  {
    const prev = setEnv({ DESKTOP_PERIMETER: "on", ...GATES3 });
    try {
      withGrants([{ path: VAULT, mode: "rw", ts: Date.now() }], () => runAsActor("autonomous", () => {
        check("autonome armé : coffre LISIBLE (ro)", confinePath(WS, coffreFile, "read") === coffreFile);
        let msg = "";
        try { confinePath(WS, coffreFile, "write"); } catch (e) { msg = (e as Error).message; }
        check("autonome armé : ÉCRITURE coffre REFUSÉE (rw rabaissé en ro)", msg.length > 0);
        check("autonome : message PÉDAGOGIQUE (pas un crash brut), mentionne « lecture seule »", /lecture seule/i.test(msg) && /périmètre/i.test(msg));
        check("autonome : workspace reste inscriptible", confinePath(WS, "src/x.js", "write") === path.resolve(WS, "src/x.js"));
      }));
    } finally { restoreEnv(prev); }
  }

  console.log("\n[E] Gate ON + AUTONOME + un garde-fou MANQUANT : FAIL-SAFE → workspace-only (coffre invisible)");
  {
    // Chacun des 3 flags manquant tour à tour → le coffre DOIT devenir inaccessible.
    for (const missing of ["MANGOQA_STOP_AUTHORITY", "NOCTURNAL_BUDGET_HARD", "NOCTURNAL_QA_BUS"]) {
      const gates = { ...GATES3, [missing]: "off" };
      const prev = setEnv({ DESKTOP_PERIMETER: "on", ...gates });
      try {
        withGrants([{ path: VAULT, mode: "rw", ts: Date.now() }], () => runAsActor("autonomous", () => {
          check(`autonome, ${missing} OFF : coffre REFUSÉ même en lecture (fail-safe)`, throws(() => confinePath(WS, coffreFile, "read")));
          check(`autonome, ${missing} OFF : workspace toujours OK (dégradé, pas cassé)`, confinePath(WS, "a.txt", "write") === path.resolve(WS, "a.txt"));
        }));
      } finally { restoreEnv(prev); }
    }
  }

  console.log("\n[F] Bout-en-bout executeContract : le vrai chemin d'écriture respecte le palier");
  {
    // F1 — OFF : écriture dans le projet OK ; « ../ » refusée, message historique.
    const prevOff = setEnv({ DESKTOP_PERIMETER: "off" });
    try {
      const ok = await executeContract([{ kind: "write", path: "out/f.txt", content: "hi" }], WS, { allowRun: false });
      check("OFF : write dans le projet réussit (byte-identique)", ok.ok && fs.existsSync(path.join(WS, "out/f.txt")));
      const bad = await executeContract([{ kind: "write", path: "../escape.txt", content: "x" }], WS, { allowRun: false });
      check("OFF : write « ../ » refusée", !bad.ok && bad.outcomes[0].status === "failed");
      check("OFF : message d'échec historique « chemin hors du projet »", bad.outcomes[0].status === "failed" && bad.outcomes[0].error.startsWith("chemin hors du projet"));
    } finally { restoreEnv(prevOff); }

    // F2 — ON interactif + coffre rw : write vers un chemin ABSOLU du coffre réussit.
    const prevOn = setEnv({ DESKTOP_PERIMETER: "on", ...GATES3 });
    try {
      const coffreTarget = path.join(VAULT, "written-by-tool.txt");
      const resI = await withGrants([{ path: VAULT, mode: "rw", ts: Date.now() }], () =>
        runAsActor("interactive", () => executeContract([{ kind: "write", path: coffreTarget, content: "coffre!" }], WS, { allowRun: false })));
      check("ON interactif : executeContract ÉCRIT dans le coffre rw (hors workspace)", resI.ok && fs.readFileSync(coffreTarget, "utf8") === "coffre!");

      // F3 — ON autonome armé : la MÊME écriture coffre ÉCHOUE proprement (pas de crash, isError).
      const coffreTarget2 = path.join(VAULT, "should-not-exist.txt");
      const resA = await withGrants([{ path: VAULT, mode: "rw", ts: Date.now() }], () =>
        runAsActor("autonomous", () => executeContract([{ kind: "write", path: coffreTarget2, content: "nope" }], WS, { allowRun: false })));
      check("ON autonome : executeContract REFUSE l'écriture coffre (résultat échec, pas d'exception)", !resA.ok && resA.outcomes[0].status === "failed");
      check("ON autonome : rien n'a été écrit dans le coffre (fail-safe effectif)", !fs.existsSync(coffreTarget2));
      check("ON autonome : le message d'échec est pédagogique (périmètre)", resA.outcomes[0].status === "failed" && /périmètre/i.test(resA.outcomes[0].error));

      // F4 — ON autonome : l'écriture DANS le workspace reste normale.
      const resW = await withGrants([{ path: VAULT, mode: "rw", ts: Date.now() }], () =>
        runAsActor("autonomous", () => executeContract([{ kind: "write", path: "ws/ok.txt", content: "ws" }], WS, { allowRun: false })));
      check("ON autonome : écriture dans le workspace TOUJOURS acceptée", resW.ok && fs.existsSync(path.join(WS, "ws/ok.txt")));
    } finally { restoreEnv(prevOn); }
  }

  fs.rmSync(WS, { recursive: true, force: true });
  fs.rmSync(VAULT, { recursive: true, force: true });

  console.log(`\n${fail === 0 ? "✅" : "❌"} perimeter-branch : ${pass} pass, ${fail} fail`);
  if (fail > 0) process.exit(1);
}

void run();
