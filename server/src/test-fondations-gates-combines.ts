// Test d'INTERACTION des gates fondations (revue Fable 2026-07-03, étape 3) —
// chaque gate est prouvé isolément par sa suite ; ICI on prouve qu'ils tiennent
// ENSEMBLE (la config nominale d'un run long type #181) : ELEVE_ETAT + ELEVE_RESUME
// + ELEVE_REFLEXION (+ snapshots de sous-agents + bornage du snapshot + OFF combiné
// byte-identique). Transport 100 % scripté, workspace temp, zéro réseau.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { ToolRegistry } from "./kernel-mcp.js";
import { buildAgentic, type PostFn, type ToolCall, type ChatMessage } from "./eleve-runtime.js";
import { SNAPSHOT_FILE } from "./loop-state.js";

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

  console.log(`\n${fail === 0 ? "✅" : "❌"} fondations-gates-combines : ${pass} pass, ${fail} fail`);
  if (fail > 0) process.exit(1);
}

void run();
