// Preuve de la boucle de relais (eleve.ts). Les « cerveaux » sont injectés :
//   - DÉTERMINISTE (défaut) : faux Élève / faux Maître / fausse inspection →
//     prouve la LOGIQUE d'orchestration (succès Élève, escalade, échec total)
//     sans réseau ni coût. executeContract est, lui, RÉEL (vrais fichiers).
//   - LIVE (--live) : vrai Gemma + vraie inspection Vite sur une copie de
//     test-pipeline ; n'appelle Claude (coût) QUE si l'Élève échoue.
//
// Lancer :  npx tsx src/test-relay.ts          (déterministe)
//           npx tsx src/test-relay.ts --live    (avec Gemma réel)

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { runRelay, type RelayDeps } from "../eleve.js";
import type { Inspection } from "../inspection.js";
import { inspectProject } from "../inspection.js";
import { resolveProfile } from "../models/profile.js";
import type { PostFn, ToolCall } from "../eleve-runtime.js";

const LIVE = process.argv.includes("--live");
import { line, makeCheck } from "./test-util.js";
let failures = 0;
const check = makeCheck(() => { failures++; });

const inspOk = (): Inspection => ({ ok: true, signal: "ok", detail: "", durationMs: 0 });
const inspKo = (d: string): Inspection => ({ ok: false, signal: "build-failed", detail: d, durationMs: 0 });

const C = (body: string) => `<mangoos>${body}</mangoos>`;
const writeMarker = (v: string) => C(`<write path="marker.txt">${v}</write><summary>set ${v}</summary>`);

// Inspection factice : verte ssi marker.txt vaut exactement "OK".
function markerInspect(dir: string): Inspection {
  try {
    return fs.readFileSync(path.join(dir, "marker.txt"), "utf8").trim() === "OK"
      ? inspOk()
      : inspKo("marker != OK");
  } catch {
    return inspKo("marker absent");
  }
}

const noEnsure = async () => {};

async function deterministic(): Promise<void> {
  line("═");
  console.log("DÉTERMINISTE — logique d'orchestration (executeContract réel)");
  line();

  // A) L'Élève réussit du premier coup
  {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "relay-A-"));
    const deps: RelayDeps = {
      askEleve: async () => writeMarker("OK"),
      inspect: async (d) => markerInspect(d),
      ensureDeps: noEnsure,
      escalate: async () => ({ axiom: false, costUsd: 0, codeChanged: true }),
    };
    const r = await runRelay("tâche", dir, { maxEleveAttempts: 2 }, deps);
    console.log("\n  [A] Élève compétent :");
    check("résolu par l'Élève", r.resolvedBy === "eleve");
    check("en 1 tentative, succès, coût 0", r.attempts === 1 && r.success && r.costUsd === 0);
    check("fichier réellement écrit (executeContract réel)", fs.existsSync(path.join(dir, "marker.txt")));
    fs.rmSync(dir, { recursive: true, force: true });
  }

  // B) L'Élève échoue 2× (build cassé) → le Maître corrige + axiome
  {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "relay-B-"));
    let escalated: boolean = false;
    const deps: RelayDeps = {
      askEleve: async () => writeMarker("BAD"), // toujours cassé
      inspect: async (d) => markerInspect(d),
      ensureDeps: noEnsure,
      escalate: async (ctx) => {
        escalated = true;
        fs.writeFileSync(path.join(ctx.projectDir, "marker.txt"), "OK"); // le Maître répare
        return { axiom: true, costUsd: 0.12, codeChanged: true };
      },
    };
    const r = await runRelay("tâche", dir, { maxEleveAttempts: 2 }, deps);
    console.log("\n  [B] Élève en échec → escalade :");
    check("escalade déclenchée après 2 échecs", escalated && r.attempts === 2);
    check("résolu par le Maître", r.resolvedBy === "maitre" && r.success);
    check("axiome appris + coût Claude reporté", r.axiom && r.costUsd === 0.12);
    fs.rmSync(dir, { recursive: true, force: true });
  }

  // C) Sortie hors-contrat (parse échoue) → escalade quand même
  {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "relay-C-"));
    const deps: RelayDeps = {
      askEleve: async () => "Bien sûr, voici comment faire... (aucune balise)",
      inspect: async (d) => markerInspect(d),
      ensureDeps: noEnsure,
      escalate: async (ctx) => {
        fs.writeFileSync(path.join(ctx.projectDir, "marker.txt"), "OK");
        return { axiom: true, costUsd: 0.08, codeChanged: true };
      },
    };
    const r = await runRelay("tâche", dir, { maxEleveAttempts: 2 }, deps);
    console.log("\n  [C] Réponse hors-contrat → escalade :");
    check("rejet répété → escalade → Maître", r.resolvedBy === "maitre" && r.success);
    fs.rmSync(dir, { recursive: true, force: true });
  }

  // D) Échec total : ni l'Élève ni le Maître ne réparent
  {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "relay-D-"));
    const deps: RelayDeps = {
      askEleve: async () => writeMarker("BAD"),
      inspect: async (d) => markerInspect(d),
      ensureDeps: noEnsure,
      escalate: async () => ({ axiom: false, costUsd: 0.05, codeChanged: false }), // le Maître ne corrige pas
    };
    const r = await runRelay("tâche", dir, { maxEleveAttempts: 1 }, deps);
    console.log("\n  [D] Échec des deux étages :");
    check("resolvedBy = none, success = false", r.resolvedBy === "none" && !r.success);
    fs.rmSync(dir, { recursive: true, force: true });
  }

  // E) #104 Phase 2 — porte FONCTIONNELLE : build vert mais app vide → relance.
  {
    // E1 — gate ON + juge bas : force une 2e tentative (le build seul ne suffit plus)
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "relay-E1-"));
    let judgeCalls = 0, eleveCalls = 0;
    const deps: RelayDeps = {
      askEleve: async () => { eleveCalls++; return writeMarker("OK"); }, // build TOUJOURS vert
      inspect: async (d) => markerInspect(d),
      ensureDeps: noEnsure,
      escalate: async () => ({ axiom: false, costUsd: 0, codeChanged: true }),
      judge: async () => { judgeCalls++; return { fonctionnel: 2, note: "template vide" }; },
    };
    const r = await runRelay("tâche", dir, { maxEleveAttempts: 2, functionalGate: true, functionalMin: 5 }, deps);
    console.log("\n  [E1] Build vert mais fonctionnel bas → porte relance :");
    check("juge appelé (porte active)", judgeCalls === 1);
    check("2 tentatives Élève (la porte a forcé un 2e tour)", eleveCalls === 2 && r.attempts === 2);
    check("succès final (dernière tentative non re-jugée)", r.success && r.resolvedBy === "eleve");
    fs.rmSync(dir, { recursive: true, force: true });
  }
  {
    // E2 — gate OFF (défaut) : build vert = succès immédiat, juge JAMAIS appelé
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "relay-E2-"));
    let judgeCalls = 0, eleveCalls = 0;
    const deps: RelayDeps = {
      askEleve: async () => { eleveCalls++; return writeMarker("OK"); },
      inspect: async (d) => markerInspect(d),
      ensureDeps: noEnsure,
      escalate: async () => ({ axiom: false, costUsd: 0, codeChanged: true }),
      judge: async () => { judgeCalls++; return { fonctionnel: 1, note: "vide" }; },
    };
    const r = await runRelay("tâche", dir, { maxEleveAttempts: 2 }, deps); // gate non passé → OFF
    console.log("\n  [E2] Porte OFF par défaut → comportement historique :");
    check("succès dès la 1re tentative", eleveCalls === 1 && r.attempts === 1 && r.success);
    check("juge JAMAIS appelé (porte inerte)", judgeCalls === 0);
    fs.rmSync(dir, { recursive: true, force: true });
  }

  // F) #146 Phase 2 — MOTEUR AGENTIQUE : profil `agentic` + transport injecté
  // (agenticPost) → la tentative DEVIENT la boucle outils, sans réseau.
  const glm = resolveProfile("glm-5.2:cloud"); // profil agentic:true
  const call = (name: string, args: object, n: number): ToolCall => ({ id: `t${n}`, function: { name, arguments: JSON.stringify(args) } });
  const agenticScript = (steps: ToolCall[][]): PostFn => {
    let i = 0;
    return async () => {
      const tc = steps[Math.min(i, steps.length - 1)];
      i++;
      return { content: "", toolCalls: tc };
    };
  };

  {
    // F1 — le moteur écrit marker.txt=OK via write_file puis finish → succès Élève.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "relay-F1-"));
    let escalated: boolean = false;
    const deps: RelayDeps = {
      askEleve: async () => writeMarker("BAD"), // ne doit PAS être utilisé (chemin agentique)
      inspect: async (d) => markerInspect(d),
      ensureDeps: noEnsure,
      escalate: async () => { escalated = true; return { axiom: false, costUsd: 0, codeChanged: true }; },
      agenticPost: agenticScript([
        [call("write_file", { path: "marker.txt", content: "OK" }, 1)],
        [call("finish", { summary: "marker posé" }, 2)],
      ]),
    };
    const r = await runRelay("tâche", dir, { profile: glm, maxEleveAttempts: 2 }, deps);
    console.log("\n  [F1] Moteur agentique → succès Élève :");
    check("profil agentic détecté (glm)", glm.agentic === true);
    check("résolu par l'Élève via outils (write_file)", r.resolvedBy === "eleve" && r.success);
    check("marker.txt réellement écrit par l'outil", fs.readFileSync(path.join(dir, "marker.txt"), "utf8").trim() === "OK");
    check("escalade NON déclenchée", !escalated);
    fs.rmSync(dir, { recursive: true, force: true });
  }

  {
    // F2 — le moteur laisse le build cassé → escalade vers le Maître (inchangée).
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "relay-F2-"));
    let escalated: boolean = false;
    const deps: RelayDeps = {
      askEleve: async () => writeMarker("BAD"),
      inspect: async (d) => markerInspect(d),
      ensureDeps: noEnsure,
      escalate: async (ctx) => { escalated = true; fs.writeFileSync(path.join(ctx.projectDir, "marker.txt"), "OK"); return { axiom: true, costUsd: 0.1, codeChanged: true }; },
      agenticPost: agenticScript([
        [call("write_file", { path: "marker.txt", content: "BAD" }, 1)],
        [call("finish", { summary: "fini (mais cassé)" }, 2)],
      ]),
    };
    const r = await runRelay("tâche", dir, { profile: glm, maxEleveAttempts: 2 }, deps);
    console.log("\n  [F2] Moteur agentique échoue → escalade Maître :");
    check("moteur n'a pas réparé → escalade", escalated);
    check("résolu par le Maître + axiome", r.resolvedBy === "maitre" && r.success && r.axiom);
    fs.rmSync(dir, { recursive: true, force: true });
  }

  {
    // F3 — ELEVE_AGENTIC=off : même profil agentic → on REPASSE au contrat <mangoos>.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "relay-F3-"));
    let agenticUsed: boolean = false;
    const prev = process.env.ELEVE_AGENTIC;
    process.env.ELEVE_AGENTIC = "off";
    const deps: RelayDeps = {
      askEleve: async () => writeMarker("OK"), // chemin contrat
      inspect: async (d) => markerInspect(d),
      ensureDeps: noEnsure,
      escalate: async () => ({ axiom: false, costUsd: 0, codeChanged: true }),
      agenticPost: async () => { agenticUsed = true; return { content: "", toolCalls: [] }; },
    };
    const r = await runRelay("tâche", dir, { profile: glm, maxEleveAttempts: 2 }, deps);
    if (prev === undefined) delete process.env.ELEVE_AGENTIC; else process.env.ELEVE_AGENTIC = prev;
    console.log("\n  [F3] ELEVE_AGENTIC=off → repli contrat (réversibilité) :");
    check("moteur agentique NON emprunté", !agenticUsed);
    check("résolu par le contrat <mangoos>", r.resolvedBy === "eleve" && r.success);
    fs.rmSync(dir, { recursive: true, force: true });
  }

  {
    // F4a — RÉVISION 2026-06-24 « apprendre, pas secourir » : build VERT mais l'Élève
    // ne conclut JAMAIS (bloqué). DÉFAUT = on N'appelle PAS Claude ; auto-relances
    // épuisées → on rend la main à Raf (resolvedBy eleve, incomplete), coût 0.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "relay-F4a-"));
    let escalated = false;
    const prevR = process.env.ELEVE_SELF_RELANCE_MAX, prevE = process.env.ELEVE_ESCALATE_ON_BLOCK;
    process.env.ELEVE_SELF_RELANCE_MAX = "1"; // 2 passes au total → test rapide
    delete process.env.ELEVE_ESCALATE_ON_BLOCK; // défaut : escalade OFF
    const deps: RelayDeps = {
      askEleve: async () => writeMarker("BAD"),
      inspect: async (d) => markerInspect(d), // marker OK → build vert
      ensureDeps: noEnsure,
      escalate: async () => { escalated = true; return { axiom: false, costUsd: 0.02, codeChanged: true }; },
      // Le moteur écrit le marker (build vert) mais ne finit JAMAIS → seen/corrections → stuck.
      agenticPost: agenticScript([[call("write_file", { path: "marker.txt", content: "OK" }, 1)]]),
    };
    const r = await runRelay("tâche", dir, { profile: glm, maxEleveAttempts: 2 }, deps);
    console.log("\n  [F4a] Défaut : Élève bloqué → auto-relance, PAS de Claude :");
    check("Claude (Maître) JAMAIS appelé sur blocage", !escalated);
    check("rendu à Raf : resolvedBy eleve + incomplete, coût 0", r.resolvedBy === "eleve" && r.incomplete === true && r.costUsd === 0);
    if (prevR === undefined) delete process.env.ELEVE_SELF_RELANCE_MAX; else process.env.ELEVE_SELF_RELANCE_MAX = prevR;
    if (prevE === undefined) delete process.env.ELEVE_ESCALATE_ON_BLOCK; else process.env.ELEVE_ESCALATE_ON_BLOCK = prevE;
    fs.rmSync(dir, { recursive: true, force: true });
  }

  {
    // F4b — CŒUR de la révision : l'auto-relance RÉUSSIT. L'Élève cale au 1er passage,
    // puis le coup de pouce (« arrête de lire, AGIS et termine ») le débloque → finish.
    // Il finit LUI-MÊME, sans Claude, coût 0 (souveraineté).
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "relay-F4b-"));
    let escalated = false;
    const prevR = process.env.ELEVE_SELF_RELANCE_MAX;
    process.env.ELEVE_SELF_RELANCE_MAX = "2";
    // Le post inspecte le prompt user : tant que le coup de pouce (« relance ») n'est pas
    // là, il écrit sans finir (→ stuck) ; dès qu'il arrive, il conclut par finish.
    const post: PostFn = async (messages) => {
      const userMsg = messages.find((m) => m.role === "user")?.content ?? "";
      return userMsg.includes("relance")
        ? { content: "", toolCalls: [call("finish", { summary: "terminé après relance" }, 9)] }
        : { content: "", toolCalls: [call("write_file", { path: "marker.txt", content: "OK" }, 1)] };
    };
    const deps: RelayDeps = {
      askEleve: async () => writeMarker("BAD"),
      inspect: async (d) => markerInspect(d),
      ensureDeps: noEnsure,
      escalate: async () => { escalated = true; return { axiom: false, costUsd: 0.02, codeChanged: true }; },
      agenticPost: post,
    };
    const r = await runRelay("tâche", dir, { profile: glm, maxEleveAttempts: 2 }, deps);
    console.log("\n  [F4b] Auto-relance réussie → l'Élève finit seul, sans Claude :");
    check("Claude JAMAIS appelé", !escalated);
    check("résolu par l'ÉLÈVE, succès, non incomplet, coût 0", r.resolvedBy === "eleve" && r.success && !r.incomplete && r.costUsd === 0);
    if (prevR === undefined) delete process.env.ELEVE_SELF_RELANCE_MAX; else process.env.ELEVE_SELF_RELANCE_MAX = prevR;
    fs.rmSync(dir, { recursive: true, force: true });
  }

  {
    // F4c — escalade Claude = OPT-IN : avec ELEVE_ESCALATE_ON_BLOCK=on, après relances
    // épuisées, on escalade en mode « terminer » (incomplete) → résolu par le Maître.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "relay-F4c-"));
    let escIncomplete = false;
    const prevR = process.env.ELEVE_SELF_RELANCE_MAX, prevE = process.env.ELEVE_ESCALATE_ON_BLOCK;
    process.env.ELEVE_SELF_RELANCE_MAX = "1";
    process.env.ELEVE_ESCALATE_ON_BLOCK = "on"; // opt-in
    const deps: RelayDeps = {
      askEleve: async () => writeMarker("BAD"),
      inspect: async (d) => markerInspect(d),
      ensureDeps: noEnsure,
      escalate: async (ctx) => { escIncomplete = ctx.incomplete === true; return { axiom: false, costUsd: 0.02, codeChanged: true }; },
      agenticPost: agenticScript([[call("write_file", { path: "marker.txt", content: "OK" }, 1)]]),
    };
    const r = await runRelay("tâche", dir, { profile: glm, maxEleveAttempts: 2 }, deps);
    console.log("\n  [F4c] Opt-in ELEVE_ESCALATE_ON_BLOCK=on → escalade (terminer) :");
    check("escalade en mode 'terminer' (incomplete)", escIncomplete);
    check("résolu par le Maître, pas laissé incomplete", r.resolvedBy === "maitre" && r.success && !r.incomplete);
    if (prevR === undefined) delete process.env.ELEVE_SELF_RELANCE_MAX; else process.env.ELEVE_SELF_RELANCE_MAX = prevR;
    if (prevE === undefined) delete process.env.ELEVE_ESCALATE_ON_BLOCK; else process.env.ELEVE_ESCALATE_ON_BLOCK = prevE;
    fs.rmSync(dir, { recursive: true, force: true });
  }

  {
    // G — L113 (run showcase 2026-07-09) : le build est DÉJÀ vert (l'Élève a laissé
    // un état compilable avant de caler), mais le Maître n'a RIEN modifié de réel
    // (escalate mock : codeChanged=false, exactement comme un tour interrompu par
    // L112 qui reçoit un `result` d'abandon précoce). AVANT le correctif, ceci
    // aurait été rapporté comme "résolu par le Maître" — un faux succès complet.
    // Après le correctif, doit être un échec explicite.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "relay-G-"));
    const prevR = process.env.ELEVE_SELF_RELANCE_MAX, prevE = process.env.ELEVE_ESCALATE_ON_BLOCK;
    process.env.ELEVE_SELF_RELANCE_MAX = "1";
    process.env.ELEVE_ESCALATE_ON_BLOCK = "on";
    const deps: RelayDeps = {
      askEleve: async () => writeMarker("BAD"),
      inspect: async (d) => markerInspect(d),
      ensureDeps: noEnsure,
      // Le Maître "répond" (result reçu, coût facturé) mais n'a rien écrit de réel.
      escalate: async () => ({ axiom: false, costUsd: 0.02, codeChanged: false }),
      // L'agentic engine laisse le build vert (marker.txt=OK) avant de caler —
      // insp.ok sera VRAI au moment de l'escalade, exactement comme L113.
      agenticPost: agenticScript([[call("write_file", { path: "marker.txt", content: "OK" }, 1)]]),
    };
    const r = await runRelay("tâche", dir, { profile: glm, maxEleveAttempts: 2 }, deps);
    console.log("\n  [G] L113 — build vert mais AUCUN code changé par le Maître :");
    check("PAS un succès malgré le build vert (L113 corrigée)", r.resolvedBy === "none" && !r.success);
    if (prevR === undefined) delete process.env.ELEVE_SELF_RELANCE_MAX; else process.env.ELEVE_SELF_RELANCE_MAX = prevR;
    if (prevE === undefined) delete process.env.ELEVE_ESCALATE_ON_BLOCK; else process.env.ELEVE_ESCALATE_ON_BLOCK = prevE;
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ── LIVE : vrai Gemma sur une copie junctionnée de test-pipeline ───────────────
const SOURCE = path.resolve(process.cwd(), "..", "workspace", "test-pipeline");

async function live(): Promise<void> {
  line("═");
  console.log("LIVE — vrai Élève (Gemma) sur un projet Vite réel");
  console.log("(Claude n'est appelé QUE si Gemma échoue — coût possible)");
  line();
  if (!fs.existsSync(SOURCE)) {
    console.log(`  ⚠ ${SOURCE} introuvable — live sauté`);
    return;
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "relay-live-"));
  const nmLink = path.join(dir, "node_modules");
  let junctioned = false;
  try {
    fs.cpSync(SOURCE, dir, {
      recursive: true,
      filter: (s) => !/(^|[\\/])(node_modules|dist|\.git)([\\/]|$)/.test(path.relative(SOURCE, s)),
    });
    try {
      fs.symlinkSync(path.join(SOURCE, "node_modules"), nmLink, "junction");
      junctioned = true;
    } catch {
      console.log("  ⚠ jonction impossible — live sauté");
      return;
    }
    // Tâche facile et additive (nouveau fichier) → ne casse pas le build existant.
    // deps par défaut = vrai Gemma + vraie inspection Vite + vrai Claude (escalade).
    const task = 'Crée le fichier "src/utils/sum.js" qui exporte une fonction sum(a, b) renvoyant a + b.';
    const r = await runRelay(task, dir, { maxEleveAttempts: 2 });
    console.log("\n  Trace :");
    for (const l of r.log) console.log(`    ${l}`);
    check(`build final vert (résolu par ${r.resolvedBy})`, r.success);
    check("fichier src/utils/sum.js créé", fs.existsSync(path.join(dir, "src", "utils", "sum.js")));
    // confirme avec la vraie inspection
    const real = await inspectProject(dir, { timeoutMs: 120_000 });
    check(`inspection Vite réelle = ${real.signal}`, real.ok);
  } finally {
    if (junctioned) {
      if (process.platform === "win32") spawnSync("cmd", ["/c", "rmdir", nmLink]);
      else fs.unlinkSync(nmLink);
    }
    if (!fs.existsSync(nmLink)) fs.rmSync(dir, { recursive: true, force: true });
    else console.log(`  ⚠ jonction présente — temp laissé : ${dir}`);
  }
}

(async () => {
  await deterministic();
  if (LIVE) await live();
  line("═");
  if (failures === 0) {
    console.log("✅ Boucle de relais PROUVÉE : Élève → juge objectif → escalade Maître + axiome.");
    process.exit(0);
  } else {
    console.log(`❌ ${failures} vérification(s) en échec.`);
    process.exit(1);
  }
})();
