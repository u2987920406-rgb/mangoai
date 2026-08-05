// Test d'INTERACTION des gates fondations (revue Fable 2026-07-03, étape 3) —
// chaque gate est prouvé isolément par sa suite ; ICI on prouve qu'ils tiennent
// ENSEMBLE (la config nominale d'un run long type #181) : ELEVE_ETAT + ELEVE_RESUME
// + ELEVE_REFLEXION (+ snapshots de sous-agents + bornage du snapshot + OFF combiné
// byte-identique). Transport 100 % scripté, workspace temp, zéro réseau.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { ToolRegistry } from "../kernel/kernel-mcp.js";
import { buildAgentic, type PostFn, type ToolCall, type ChatMessage } from "../eleve-runtime.js";
import { SNAPSHOT_FILE } from "../loop-state.js";
// ── #182 É8 — interaction des 6 gates du chantier intention/dispatch (§4.7-4.8) ──
import { Blackboard, setBlackboard, resetBlackboard, getBlackboard } from "../kernel/kernel-blackboard.js";
import { MemoryStore } from "../kernel/kernel-blackboard-store.js";
import type { DraftStep } from "../eleve-speculative/eleve-speculative-runner.js";
import type { SelfWorktree } from "../mango-self.js";
import { dispatch } from "../brain/brain-dispatch.js";
import type { DispatchOpts } from "../brain/brain-dispatch.js";
import { temporalContext } from "../temporal-context.js";
import { buildEleveActionTools } from "../eleve-tools/eleve-action-tools.js";
import { policyFromCaps, mutationToolNames } from "../eleve-tools/eleve-tool-capabilities.js";
import { flag } from "../flags.js";
import { readGlobalBudgetState, spendGlobalBudget } from "../nocturnal-budget.js";
// ── #180 É2 — interaction du gate DESKTOP_PERIMETER avec reprise + garde-fous ──
import { executeContract } from "../executor.js";
import { GRANTS_FILE, saveGrants } from "../perimeter.js";
// (#180 É6) interaction DESKTOP_SYSTEM_SHELL × acteur autonome (risque #8 du plan) ──
import { runSystemPaletteCommand, approveFamily, resetApprovedFamilies } from "../eleve-tools/eleve-system-tools.js";
import { listPerimeterIncidents, clearPerimeterIncidents, combineBreakerVerdict } from "../perimeter-incidents.js";
import { decideBreakerStop } from "../nocturnal.js";
import { runAsActor } from "../perimeter-context.js";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

function call(name: string, args: object): ToolCall {
  return { id: `c_${name}_${Math.random().toString(36).slice(2, 8)}`, function: { name, arguments: JSON.stringify(args) } };
}

function makeRegistry(): ToolRegistry {
  const reg = new ToolRegistry();
  // Résultat d'outil VOLUMINEUX : c'est `content` (les résultats) que la compaction
  // mesure — pas les args. Indispensable pour déclencher compact() dans ces tests.
  reg.register({ name: "write_file", description: "", inputSchema: { path: z.string(), content: z.string() }, handler: () => ({ text: "écrit. " + "x".repeat(800) }) });
  reg.register({ name: "read_file", description: "", inputSchema: { path: z.string() }, handler: () => ({ text: "x".repeat(400) }) });
  reg.register({ name: "finish", description: "", inputSchema: { summary: z.string() }, handler: (a) => ({ text: String(a.summary) }) });
  return reg;
}

/** Pose les 5 gates Élève du chantier. `mode`: "on" | "off" (valeur explicite) | "absent". */
const GATES = ["ELEVE_ETAT", "ELEVE_RESUME", "ELEVE_REFLEXION", "ELEVE_PLAN_V2", "ELEVE_MEMOIRE"] as const;
function setGates(mode: "on" | "off" | "absent"): Record<string, string | undefined> {
  const prev: Record<string, string | undefined> = {};
  for (const g of GATES) {
    prev[g] = process.env[g];
    if (mode === "absent") delete process.env[g];
    else process.env[g] = mode;
  }
  return prev;
}
function restoreGates(prev: Record<string, string | undefined>): void {
  for (const g of GATES) {
    if (prev[g] === undefined) delete process.env[g]; else process.env[g] = prev[g]!;
  }
}

/** Post scripté : écrit `writes` fichiers (contenu volumineux), lit entre deux,
 * puis conclut par finish — ou s'interrompt (throw) à l'itération `crashAt`. */
function scriptedPost(opts: { writes: number; crashAt?: number; bigContent?: number }): {
  post: PostFn;
  transcripts: string[];
} {
  let iter = 0;
  const transcripts: string[] = [];
  const post: PostFn = async (messages, tools) => {
    transcripts.push(JSON.stringify(messages.map((m) => ({ r: m.role, c: m.content }))));
    // Tour de réflexion / conclusion demandé (pas d'outils proposés) → texte simple.
    if (!tools) return { content: "point : acquis A, blocage aucun, prochaine étape B.", toolCalls: undefined };
    if (opts.crashAt !== undefined && iter >= opts.crashAt) throw new Error("CRASH SIMULÉ (interruption)");
    const i = iter++;
    if (i < opts.writes) {
      return { content: "", toolCalls: [call("write_file", { path: `src/f${i}.js`, content: "y".repeat(opts.bigContent ?? 10_000) })] };
    }
    return { content: "", toolCalls: [call("finish", { summary: "fini" })] };
  };
  return { post, transcripts };
}

async function run() {
  console.log("─".repeat(64));
  console.log("test-fondations-gates-combines (revue Fable, étape 3)");
  console.log("─".repeat(64));

  console.log("\n[1] ETAT+RESUME : la REPRISE fonctionne malgré l'état splicé en index 1 (🔴1)");
  {
    const prev = setGates("absent");
    process.env.ELEVE_ETAT = "on";
    process.env.ELEVE_RESUME = "on";
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gates1-"));
    const logs: string[] = [];
    try {
      // Run 1 : ctxMax minuscule → compaction certaine → l'ÉTAT DE TRAVAIL est splicé
      // en index 1 des messages ; crash à l'itération 6 (après plusieurs snapshots).
      const r1 = scriptedPost({ writes: 20, crashAt: 6, bigContent: 3_000 });
      await buildAgentic("sys", "construis la formation", makeRegistry(), {
        post: r1.post, projectDir: tmp, maxIterations: 30, ctxMaxChars: 2_000,
      }).catch(() => null); // le crash simulé remonte — c'est voulu
      const snapRaw = fs.readFileSync(path.join(tmp, SNAPSHOT_FILE), "utf8");
      const snap = JSON.parse(snapRaw) as { user?: string; messages?: Array<{ role: string; content: string }> };
      check("le snapshot du crash existe et porte le champ user", snap.user === "construis la formation");
      const idx1 = snap.messages?.[1];
      check("précondition du bug : messages[1] EST l'état de travail (system), pas le user", idx1?.role === "system" && /^ÉTAT DE TRAVAIL/.test(idx1?.content ?? ""));

      // Run 2 : MÊME tâche → la reprise doit avoir lieu (l'ancienne garde messages[1]
      // aurait échoué ici — c'est LE test qui manquait).
      const r2 = scriptedPost({ writes: 0 }); // reprend et conclut
      const res2 = await buildAgentic("sys", "construis la formation", makeRegistry(), {
        post: r2.post, projectDir: tmp, maxIterations: 30, ctxMaxChars: 2_000,
        onLog: (l) => logs.push(l),
      });
      check("↩ Reprise loggée (la garde « même tâche » accepte le snapshot v2)", logs.some((l) => l.includes("↩ Reprise")));
      check("le nudge de reprise est dans le transcript", r2.transcripts.some((t) => t.includes("REPRISE après interruption")));
      check("la trace du run 1 est héritée (write_file)", res2.toolTrace.some((t) => t.name === "write_file"));
      check("le run 2 conclut", res2.finished || res2.text.length > 0);
    } finally {
      restoreGates(prev);
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }

  console.log("\n[2] ETAT+RESUME : UN SEUL message « ÉTAT DE TRAVAIL » après reprise + nouvelle compaction (🔴1 suite)");
  {
    const prev = setGates("absent");
    process.env.ELEVE_ETAT = "on";
    process.env.ELEVE_RESUME = "on";
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gates2-"));
    try {
      const r1 = scriptedPost({ writes: 20, crashAt: 6, bigContent: 3_000 });
      await buildAgentic("sys", "t", makeRegistry(), { post: r1.post, projectDir: tmp, maxIterations: 30, ctxMaxChars: 2_000 }).catch(() => null);
      // Run 2 : continue d'écrire (compactions supplémentaires garanties), puis finit.
      const r2 = scriptedPost({ writes: 6, bigContent: 3_000 });
      await buildAgentic("sys", "t", makeRegistry(), { post: r2.post, projectDir: tmp, maxIterations: 30, ctxMaxChars: 2_000 });
      // Sur TOUS les prompts vus par le modèle au run 2 : jamais 2 états empilés.
      const maxEtats = Math.max(...r2.transcripts.map((t) => {
        const msgs = JSON.parse(t) as Array<{ r: string; c: string }>;
        return msgs.filter((m) => m.r === "system" && /^ÉTAT DE TRAVAIL/.test(m.c)).length;
      }));
      check("jamais plus d'UN message d'état dans le contexte (remplacé, pas empilé)", maxEtats <= 1);
      const derniers = JSON.parse(r2.transcripts[r2.transcripts.length - 1]) as Array<{ r: string; c: string }>;
      const etat = derniers.find((m) => m.r === "system" && /^ÉTAT DE TRAVAIL/.test(m.c));
      check("l'état est borné (≤ 600 car. — cap de working-memory)", (etat?.c.length ?? 0) <= 600);
      check("l'état RÉCONCILIÉ liste les fichiers écrits AVANT le crash (🟠5)", /src\/f0\.js/.test(etat?.c ?? ""));
    } finally {
      restoreGates(prev);
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }

  console.log("\n[3] RESUME : le nudge de reprise invite à RE-POSER le plan (🟠5)");
  {
    const prev = setGates("absent");
    process.env.ELEVE_RESUME = "on";
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gates3-"));
    try {
      const r1 = scriptedPost({ writes: 20, crashAt: 4 });
      await buildAgentic("sys", "t", makeRegistry(), { post: r1.post, projectDir: tmp, maxIterations: 30 }).catch(() => null);
      const r2 = scriptedPost({ writes: 0 });
      await buildAgentic("sys", "t", makeRegistry(), { post: r2.post, projectDir: tmp, maxIterations: 30 });
      check("le nudge mentionne la re-pose du plan (il ne survit pas au crash)", r2.transcripts.some((t) => t.includes("re-pose-le d'abord")));
    } finally {
      restoreGates(prev);
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }

  console.log("\n[4] RESUME + sous-agents : snapshots:false → le sous-agent n'écrase NI ne supprime le snapshot du parent (🟠2)");
  {
    const prev = setGates("absent");
    process.env.ELEVE_RESUME = "on";
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gates4-"));
    try {
      // Un « snapshot du parent » préexistant sur le même projectDir.
      const parentSnap = JSON.stringify({ version: 2, ts: Date.now(), iter: 3, user: "TÂCHE DU PARENT", hasWritten: true, messages: [{ role: "system", content: "s" }, { role: "user", content: "TÂCHE DU PARENT" }], toolTrace: [] });
      fs.writeFileSync(path.join(tmp, SNAPSHOT_FILE), parentSnap);
      // Le « sous-agent » (snapshots:false) tourne sur le MÊME dossier et finit.
      const sub = scriptedPost({ writes: 2, bigContent: 100 });
      const res = await buildAgentic("sys", "sous-tâche déléguée", makeRegistry(), {
        post: sub.post, projectDir: tmp, maxIterations: 10, snapshots: false,
      });
      check("le sous-agent a fini proprement", res.finished);
      const after = fs.readFileSync(path.join(tmp, SNAPSHOT_FILE), "utf8");
      check("le snapshot du parent est INTACT (ni écrasé ni supprimé par le finish du sous-agent)", after === parentSnap);
      check("le sous-agent n'a PAS repris la tâche du parent", !sub.transcripts.some((t) => t.includes("REPRISE après interruption")));
    } finally {
      restoreGates(prev);
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }

  console.log("\n[5] RESUME : sorties TERMINALES (plafond) purgent le snapshot (🟠3)");
  {
    const prev = setGates("absent");
    process.env.ELEVE_RESUME = "on";
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gates5-"));
    try {
      const r = scriptedPost({ writes: 100, bigContent: 50 }); // n'appelle jamais finish
      await buildAgentic("sys", "t", makeRegistry(), { post: r.post, projectDir: tmp, maxIterations: 4 });
      check("plafond d'itérations → snapshot purgé (pas de reprise empoisonnée)", !fs.existsSync(path.join(tmp, SNAPSHOT_FILE)));
    } finally {
      restoreGates(prev);
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }

  console.log("\n[6] RESUME : le snapshot reste BORNÉ malgré de grosses écritures (🟠4)");
  {
    const prev = setGates("absent");
    process.env.ELEVE_RESUME = "on";
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gates6-"));
    try {
      // 12 écritures de 10 000 car. = 120 k de contenus ; crash avant finish pour
      // garder le snapshot sur disque. La trace compressée ne doit garder que les
      // chemins → fichier snapshot très en-dessous du cumul des contenus.
      const r = scriptedPost({ writes: 12, crashAt: 12, bigContent: 10_000 });
      await buildAgentic("sys", "t", makeRegistry(), { post: r.post, projectDir: tmp, maxIterations: 30, ctxMaxChars: 4_000 }).catch(() => null);
      const size = fs.statSync(path.join(tmp, SNAPSHOT_FILE)).size;
      check(`snapshot borné (${size} octets < 30 000, pour ~120 000 de contenus écrits)`, size < 30_000);
      const snap = JSON.parse(fs.readFileSync(path.join(tmp, SNAPSHOT_FILE), "utf8")) as { toolTrace: Array<{ name: string; args: string }> };
      check("la trace compressée reste PARSEABLE pour extraire les chemins", snap.toolTrace.every((t) => {
        if (t.name !== "write_file") return true;
        try { return typeof (JSON.parse(t.args) as { path?: unknown }).path === "string"; } catch { return false; }
      }));
    } finally {
      restoreGates(prev);
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }

  console.log("\n[7] REFLEXION + ETAT + RESUME ensemble : run long sain, réflexions bornées");
  {
    const prev = setGates("absent");
    process.env.ELEVE_ETAT = "on";
    process.env.ELEVE_RESUME = "on";
    process.env.ELEVE_REFLEXION = "on";
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gates7-"));
    try {
      const r = scriptedPost({ writes: 18, bigContent: 2_000 });
      const res = await buildAgentic("sys", "t", makeRegistry(), { post: r.post, projectDir: tmp, maxIterations: 40, ctxMaxChars: 3_000 });
      check("le run conclut malgré les 3 gates actifs", res.finished);
      // Bornage : on compte les messages de réflexion DISTINCTS dans le DERNIER
      // transcript (un message resté dans l'historique apparaît dans tous les
      // prompts suivants — compter les transcripts les comptait N fois).
      const derniersMsgs = JSON.parse(r.transcripts[r.transcripts.length - 1]) as Array<{ r: string; c: string }>;
      const reflexions = derniersMsgs.filter((m) => m.r === "user" && m.c.includes("Fais le POINT")).length;
      check(`réflexions bornées (${reflexions} ≤ 3)`, reflexions <= 3);
      // Protocole sain : dans chaque prompt, jamais un user « Fais le POINT » entre un
      // assistant à tool_calls et sa réponse tool (le scripted post aurait crashé sinon —
      // on vérifie qu'aucun transcript ne montre tool juste APRÈS le user de réflexion).
      const protocoleSain = r.transcripts.every((t) => {
        const msgs = JSON.parse(t) as Array<{ r: string; c: string }>;
        return msgs.every((m, i) => !(m.r === "user" && m.c.includes("Fais le POINT") && msgs[i + 1]?.r === "tool"));
      });
      check("protocole function-calling jamais cassé par une réflexion", protocoleSain);
    } finally {
      restoreGates(prev);
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }

  console.log("\n[8] OFF combiné = byte-identique : gates absents VS gates off explicites");
  {
    const tmpA = fs.mkdtempSync(path.join(os.tmpdir(), "gates8a-"));
    const tmpB = fs.mkdtempSync(path.join(os.tmpdir(), "gates8b-"));
    const prevA = setGates("absent");
    try {
      const rA = scriptedPost({ writes: 5, bigContent: 2_000 });
      const resA = await buildAgentic("sys", "t", makeRegistry(), { post: rA.post, projectDir: tmpA, maxIterations: 20, ctxMaxChars: 3_000 });
      restoreGates(prevA);
      const prevB = setGates("off");
      const rB = scriptedPost({ writes: 5, bigContent: 2_000 });
      const resB = await buildAgentic("sys", "t", makeRegistry(), { post: rB.post, projectDir: tmpB, maxIterations: 20, ctxMaxChars: 3_000 });
      restoreGates(prevB);
      // Les ids d'appels d'outils sont aléatoires → on compare rôles+contenus, pas les ids.
      check("séquences de prompts STRICTEMENT identiques (absent VS off)", JSON.stringify(rA.transcripts) === JSON.stringify(rB.transcripts));
      check("résultats identiques (iterations, finished)", resA.iterations === resB.iterations && resA.finished === resB.finished);
      check("aucun snapshot écrit dans les deux cas", !fs.existsSync(path.join(tmpA, SNAPSHOT_FILE)) && !fs.existsSync(path.join(tmpB, SNAPSHOT_FILE)));
    } finally {
      fs.rmSync(tmpA, { recursive: true, force: true });
      fs.rmSync(tmpB, { recursive: true, force: true });
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  #180 É2 — PÉRIMÈTRE × REPRISE × garde-fous nocturnes. Le gate DESKTOP_PERIMETER
  //  n'a JAMAIS coexisté avec ELEVE_RESUME ni les 3 garde-fous (risque #8 du plan
  //  #180 : « interaction des gates jamais tournés ensemble »). On CHERCHE la
  //  cassure : un périmètre autonome tenu À TRAVERS un crash+reprise, une écriture
  //  hors-workspace refusée SANS casser la boucle, et la contre-preuve interactive.
  // ════════════════════════════════════════════════════════════════════════════
  console.log("\n[20] PÉRIMÈTRE(autonome) × REPRISE × 3 garde-fous : le coffre reste interdit à travers le crash");
  {
    const P = {
      DESKTOP_PERIMETER: "on", ELEVE_RESUME: "on", ELEVE_ETAT: "on",
      MANGOQA_STOP_AUTHORITY: "on", NOCTURNAL_BUDGET_HARD: "on", NOCTURNAL_QA_BUS: "on",
    } as const;
    const prev: Record<string, string | undefined> = {};
    for (const [k, v] of Object.entries(P)) { prev[k] = process.env[k]; process.env[k] = v; }
    const grantsPrev = fs.existsSync(GRANTS_FILE) ? fs.readFileSync(GRANTS_FILE) : null;
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "perim20-"));
    const vault = fs.mkdtempSync(path.join(os.tmpdir(), "perim20-vault-"));
    const coffreAbs = path.join(vault, "leak.txt");
    // write_file DÉLÈGUE au vrai executeContract → périmètre réel (perimeter-context).
    const makeReg = (proj: string): ToolRegistry => {
      const r = new ToolRegistry();
      r.register({
        name: "write_file", description: "", inputSchema: { path: z.string(), content: z.string() },
        handler: async (a) => {
          const res = await executeContract([{ kind: "write", path: String(a.path), content: String(a.content) }], proj, { allowRun: false });
          return res.ok ? { text: "écrit " + String(a.path) } : { text: res.outcomes[0].status === "failed" ? res.outcomes[0].error : "échec", isError: true };
        },
      });
      r.register({ name: "finish", description: "", inputSchema: { summary: z.string() }, handler: (a) => ({ text: String(a.summary) }) });
      return r;
    };
    try {
      saveGrants([{ path: vault, mode: "rw", ts: Date.now() }], GRANTS_FILE);

      // Run 1 (AUTONOME) : écrit dans le workspace, TENTE le coffre (doit échouer), puis CRASH.
      let it = 0;
      const post1: PostFn = async (_m, tools) => {
        if (!tools) return { content: "point", toolCalls: undefined };
        const i = it++;
        if (i === 0) return { content: "", toolCalls: [call("write_file", { path: "src/app.js", content: "x" })] };
        if (i === 1) return { content: "", toolCalls: [call("write_file", { path: coffreAbs, content: "SECRET" })] };
        throw new Error("CRASH SIMULÉ");
      };
      await buildAgentic("sys", "tâche périmètre", makeReg(tmp), { post: post1, projectDir: tmp, maxIterations: 30, actor: "autonomous" }).catch(() => null);
      check("run1 autonome : fichier WORKSPACE écrit (le workspace reste inscriptible)", fs.existsSync(path.join(tmp, "src/app.js")));
      check("run1 autonome : écriture COFFRE refusée (fail-safe — rien n'a fuité hors workspace)", !fs.existsSync(coffreAbs));
      check("run1 : le snapshot de reprise a survécu au crash (périmètre n'a pas cassé le resume)", fs.existsSync(path.join(tmp, SNAPSHOT_FILE)));

      // Run 2 (AUTONOME, même tâche) : la reprise conclut, le coffre reste interdit APRÈS reprise.
      const post2: PostFn = async (_m, tools) => tools ? { content: "", toolCalls: [call("finish", { summary: "fini" })] } : { content: "point", toolCalls: undefined };
      const res2 = await buildAgentic("sys", "tâche périmètre", makeReg(tmp), { post: post2, projectDir: tmp, maxIterations: 30, actor: "autonomous" });
      check("run2 : reprise CONCLUT malgré périmètre+resume+3 garde-fous combinés", res2.finished || res2.text.length > 0);
      check("run2 : le coffre n'a TOUJOURS pas été écrit après reprise (périmètre tenu de bout en bout)", !fs.existsSync(coffreAbs));

      // Contre-preuve INTERACTIF : le MÊME coffre EST écrit quand l'acteur est interactif —
      // le refus vient donc bien du PALIER (D4), pas d'un bug de branchement.
      const tmpI = fs.mkdtempSync(path.join(os.tmpdir(), "perim20-inter-"));
      let itI = 0;
      const postI: PostFn = async (_m, tools) => {
        if (!tools) return { content: "point", toolCalls: undefined };
        if (itI++ === 0) return { content: "", toolCalls: [call("write_file", { path: coffreAbs, content: "OK-INTERACTIF" })] };
        return { content: "", toolCalls: [call("finish", { summary: "fini" })] };
      };
      await buildAgentic("sys", "écris dans le coffre", makeReg(tmpI), { post: postI, projectDir: tmpI, maxIterations: 10, actor: "interactive" });
      check("contre-preuve interactif : le MÊME coffre EST écrit (le refus autonome est bien le palier, pas un bug)", fs.readFileSync(coffreAbs, "utf8") === "OK-INTERACTIF");
      fs.rmSync(tmpI, { recursive: true, force: true });
    } finally {
      for (const [k, v] of Object.entries(prev)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
      if (grantsPrev === null) { try { fs.unlinkSync(GRANTS_FILE); } catch { /**/ } } else fs.writeFileSync(GRANTS_FILE, grantsPrev);
      fs.rmSync(tmp, { recursive: true, force: true });
      fs.rmSync(vault, { recursive: true, force: true });
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  #180 É6 — DESKTOP_SYSTEM_SHELL × acteur AUTONOME (risque #8 du plan #180,
  //  §4 : « interaction des gates jamais tournés ensemble »). Ce gate n'a JAMAIS
  //  coexisté avec un acteur autonome dans un test — on prouve ici que le fail-safe
  //  D4/D7 tient MÊME quand le gate est ON et qu'une famille est déjà approuvée
  //  (le fail-safe acteur précède TOUT le reste, y compris une approbation valide),
  //  et que la tentative produit bien le signal breaker lu par decideBreakerStop.
  // ════════════════════════════════════════════════════════════════════════════
  console.log("\n[21] DESKTOP_SYSTEM_SHELL × acteur AUTONOME : refus INCONDITIONNEL + signal breaker");
  {
    const prevGate = process.env.DESKTOP_SYSTEM_SHELL;
    process.env.DESKTOP_SYSTEM_SHELL = "on";
    resetApprovedFamilies();
    clearPerimeterIncidents();
    try {
      // Précondition : la famille EST approuvée (le cas le plus favorable au passage).
      approveFamily("node-info");
      const r = await runAsActor("autonomous", () => runSystemPaletteCommand("node --version"));
      check("gate ON + famille approuvée + acteur AUTONOME → refus quand même (fail-safe D4)", !r.ok && r.isError === true);
      check("le message cite explicitement le fail-safe autonome", /AUTONOME/.test(r.text));

      const incidents = listPerimeterIncidents();
      check("un incident 'forbidden-command-autonomous' a été enregistré", incidents.some((i) => i.kind === "forbidden-command-autonomous"));

      const combined = combineBreakerVerdict({ available: false, reason: "absent" }, incidents);
      check("le verdict COMBINÉ (même sans fichier MangoQA) est safe:false", combined.available === true && combined.safe === false);

      const stop = decideBreakerStop(true, () => combined);
      check("decideBreakerStop LIT ce signal et déclenche l'arrêt à la frontière", stop.stop === true);

      // Contre-preuve : le MÊME appel en INTERACTIF passe (même famille approuvée) —
      // le refus vient bien du PALIER acteur, pas d'un bug de la famille/gate.
      const r2 = await runAsActor("interactive", () => runSystemPaletteCommand("node --version"));
      check("contre-preuve interactif : une famille approuvée s'exécute normalement", r2.ok === true);
    } finally {
      if (prevGate === undefined) delete process.env.DESKTOP_SYSTEM_SHELL; else process.env.DESKTOP_SYSTEM_SHELL = prevGate;
      resetApprovedFamilies();
      clearPerimeterIncidents();
    }
  }

  console.log(`\n${fail === 0 ? "✅" : "❌"} fondations-gates-combines : ${pass} pass, ${fail} fail`);
  if (fail > 0) process.exit(1);
}

/** Compte les clés d'un scope du Blackboard courant (helper de diagnostic des tests #182). */
function getBlackboardKeys(scope: string): number {
  return getBlackboard().keys(scope).length;
}

void run();
