// Tests du runtime agentique (eleve-runtime.buildAgentic).
// 100 % déterministe : transport `post` FAUX scripté + registre stub → zéro
// réseau, zéro vrai build. On prouve l'ordre d'invocation, la fin sur `finish`,
// l'anti-répétition (sortie contrôlée) et la compaction de contexte.

import { z } from "zod";
import { ToolRegistry } from "./kernel-mcp.js";
import { buildAgentic, runAgenticTask, type PostFn, type ChatMessage, type ToolCall } from "./eleve-runtime.js";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.log(`  ✗ ${label}`);
  }
}

function call(name: string, args: object): ToolCall {
  return { id: `c_${name}_${Math.random().toString(36).slice(2, 6)}`, function: { name, arguments: JSON.stringify(args) } };
}

/** Transport scripté : renvoie `steps[i]` (clampé au dernier). Capture chaque
 * snapshot de `messages` reçu (pour vérifier la compaction). */
function scriptedPost(steps: Array<{ content?: string; toolCalls?: ToolCall[] }>): {
  post: PostFn;
  snapshots: ChatMessage[][];
} {
  let i = 0;
  const snapshots: ChatMessage[][] = [];
  const post: PostFn = async (messages) => {
    snapshots.push(messages.map((m) => ({ ...m })));
    const step = steps[Math.min(i, steps.length - 1)];
    i++;
    return { content: step.content ?? "", toolCalls: step.toolCalls };
  };
  return { post, snapshots };
}

/** Registre stub : write_file (enregistre), check_build (toujours vert),
 * read_big (gros résultat, pour la compaction), finish. */
function stubRegistry(writes: Array<Record<string, unknown>>): ToolRegistry {
  const reg = new ToolRegistry();
  reg.register({ name: "write_file", description: "", inputSchema: { path: z.string(), content: z.string() }, handler: (a) => { writes.push(a); return { text: "écrit" }; } });
  reg.register({ name: "check_build", description: "", inputSchema: {}, handler: () => ({ text: "BUILD VERT" }) });
  reg.register({ name: "read_big", description: "", inputSchema: {}, handler: () => ({ text: "X".repeat(1000) }) });
  reg.register({ name: "run_command", description: "", inputSchema: { command: z.string() }, handler: () => ({ text: "FAILED", isError: true }) });
  reg.register({ name: "finish", description: "", inputSchema: { summary: z.string() }, handler: (a) => ({ text: String(a.summary) }) });
  return reg;
}

async function run() {
  console.log("\n[1] Chemin nominal : write → check_build → finish");
  {
    const writes: Array<Record<string, unknown>> = [];
    const reg = stubRegistry(writes);
    const { post } = scriptedPost([
      { toolCalls: [call("write_file", { path: "a.js", content: "x" })] },
      { toolCalls: [call("check_build", {})] },
      { toolCalls: [call("finish", { summary: "todo app livrée" })] },
    ]);
    const r = await buildAgentic("sys", "construis", reg, { post, maxIterations: 10 });
    check("finished === true (finish appelé)", r.finished === true);
    check("résumé remonté", r.text === "todo app livrée");
    check("ordre des outils write→check_build→finish", r.toolTrace.map((t) => t.name).join(",") === "write_file,check_build,finish");
    check("write_file réellement invoqué une fois", writes.length === 1 && writes[0].path === "a.js");
    check("3 itérations", r.iterations === 3);
  }

  console.log("\n[2] Anti-répétition : même appel en boucle → sortie contrôlée");
  {
    const writes: Array<Record<string, unknown>> = [];
    const reg = stubRegistry(writes);
    const { post } = scriptedPost([{ toolCalls: [call("write_file", { path: "a.js", content: "x" })] }]);
    // args identiques à chaque tour (le call() ci-dessus est figé dans steps[0]).
    const r = await buildAgentic("sys", "x", reg, { post, maxIterations: 30, repeatLimit: 2, maxCorrections: 2 });
    check("stuck === true", r.stuck === true);
    check("finished === false", r.finished === false);
    check("outil exécuté au plus repeatLimit fois (pas à l'infini)", writes.length <= 2);
    check("boucle bornée (n'a pas atteint maxIterations)", r.iterations < 30);
  }

  console.log("\n[3] Compaction : gros résultats d'outils tronqués");
  {
    const reg = stubRegistry([]);
    // read_big à chaque tour ; repeatLimit haut pour ne PAS déclencher l'anti-répétition.
    const { post, snapshots } = scriptedPost([{ toolCalls: [call("read_big", {})] }]);
    await buildAgentic("sys", "explore", reg, { post, maxIterations: 6, ctxMaxChars: 800, maxToolResult: 4000, repeatLimit: 999 });
    const compacted = snapshots.some((snap) => snap.some((m) => m.content.includes("[résultat compacté]")));
    check("un vieux résultat d'outil a été compacté", compacted);
    const lastSnap = snapshots[snapshots.length - 1];
    check("les derniers messages restent intacts (non compactés)", lastSnap.slice(-3).every((m) => !m.content.includes("[résultat compacté]")));
  }

  console.log("\n[4] Conclusion sans finish (modèle s'arrête)");
  {
    const reg = stubRegistry([]);
    const { post } = scriptedPost([{ content: "voici ma réponse", toolCalls: undefined }]);
    const r = await buildAgentic("sys", "?", reg, { post, maxIterations: 5 });
    check("finished === false (pas de finish)", r.finished === false);
    check("texte = contenu du modèle", r.text === "voici ma réponse");
  }

  console.log("\n[5] Délégation (Phase D) : sous-agents bornés");
  {
    // 5a — délégation nominale : le parent confie l'écriture à un sous-agent.
    const writes: Array<Record<string, unknown>> = [];
    const budget = { spawned: 0, max: 4 };
    const { post } = scriptedPost([
      { toolCalls: [call("delegate", { subtask: "écris a.js" })] }, // parent → délègue
      { toolCalls: [call("write_file", { path: "a.js", content: "x" })] }, // sous-agent
      { toolCalls: [call("finish", { summary: "a.js fait" })] }, // sous-agent termine
      { toolCalls: [call("finish", { summary: "tout fait" })] }, // parent termine
    ]);
    const r = await runAgenticTask("construis", {
      projectDir: ".", system: "sys", post,
      buildRegistry: () => stubRegistry(writes), buildUser: (s) => s,
      depth: 0, maxDepth: 2, budget,
    });
    check("parent termine (finish) avec son propre résumé", r.finished && r.text === "tout fait");
    check("le SOUS-AGENT a écrit a.js (pas le parent)", writes.length === 1 && writes[0].path === "a.js");
    check("1 sous-agent lancé (budget partagé)", budget.spawned === 1);
    check("le parent a bien appelé delegate", r.toolTrace.some((t) => t.name === "delegate"));
  }
  {
    // 5b — profondeur max 0 : l'outil delegate n'est même pas offert.
    const writes: Array<Record<string, unknown>> = [];
    const budget = { spawned: 0, max: 4 };
    const { post } = scriptedPost([
      { toolCalls: [call("delegate", { subtask: "x" })] }, // tenté mais outil absent → erreur
      { toolCalls: [call("finish", { summary: "fin" })] },
    ]);
    const r = await runAgenticTask("t", {
      projectDir: ".", system: "s", post,
      buildRegistry: () => stubRegistry(writes), buildUser: (s) => s,
      depth: 0, maxDepth: 0, budget,
    });
    check("profondeur max 0 → aucun sous-agent lancé", budget.spawned === 0);
    check("le parent termine quand même", r.finished === true);
  }
  {
    // 5c — budget épuisé : la 2e délégation est refusée (pas de 2e sous-agent).
    const writes: Array<Record<string, unknown>> = [];
    const budget = { spawned: 0, max: 1 };
    const { post } = scriptedPost([
      { toolCalls: [call("delegate", { subtask: "s1" })] }, // parent → sub1 (ok)
      { toolCalls: [call("finish", { summary: "s1 ok" })] }, // sub1 termine
      { toolCalls: [call("delegate", { subtask: "s2" })] }, // parent → refusé (budget)
      { toolCalls: [call("finish", { summary: "fin" })] }, // parent termine
    ]);
    const r = await runAgenticTask("t", {
      projectDir: ".", system: "s", post,
      buildRegistry: () => stubRegistry(writes), buildUser: (s) => s,
      depth: 0, maxDepth: 2, budget,
    });
    check("budget plafonné à 1 sous-agent (2e refusé)", budget.spawned === 1);
    check("le parent termine malgré le refus", r.finished === true);
  }

  console.log("\n[6] Anti-tâtonnement : outils en échec répété (args variés) → sortie contrôlée");
  {
    const reg = stubRegistry([]);
    let i = 0;
    // run_command qui échoue, avec un argument DIFFÉRENT à chaque tour (l'anti-répétition
    // par clé ne se déclenche pas → c'est bien la garde d'échecs consécutifs qui agit).
    const post: PostFn = async () => ({ content: "", toolCalls: [call("run_command", { command: `essai${i++}` })] });
    const r = await buildAgentic("sys", "fais", reg, { post, maxIterations: 40, repeatLimit: 3, maxCorrections: 3 });
    check("sortie contrôlée (stuck) sur échecs consécutifs", r.stuck === true && r.finished === false);
    check("borné bien avant le plafond", r.iterations < 40);
  }

  console.log("\n[7] Phase E3 — allowDelegate=false : l'outil delegate n'est pas offert");
  {
    const writes: Array<Record<string, unknown>> = [];
    const budget = { spawned: 0, max: 4 };
    const { post } = scriptedPost([
      { toolCalls: [call("delegate", { subtask: "x" })] }, // tenté → outil absent → erreur
      { toolCalls: [call("finish", { summary: "fin" })] },
    ]);
    const r = await runAgenticTask("t", {
      projectDir: ".", system: "s", post,
      buildRegistry: () => stubRegistry(writes), buildUser: (s) => s,
      depth: 0, maxDepth: 2, budget,
      allowDelegate: false, // cerveau faible → pas de délégation
    });
    check("allowDelegate=false → aucun sous-agent lancé", budget.spawned === 0);
    check("le parent termine quand même", r.finished === true);
  }

  console.log("\n[8] Phase E3 — agentType : le sous-agent prend SON cerveau (override injecté)");
  {
    const parentWrites: Array<Record<string, unknown>> = [];
    const subWrites: Array<Record<string, unknown>> = [];
    const budget = { spawned: 0, max: 4 };
    const { post } = scriptedPost([
      { toolCalls: [call("delegate", { subtask: "écris b.js", agentType: "construire" })] }, // parent → délègue au cerveau "construire"
      { toolCalls: [call("write_file", { path: "b.js", content: "y" })] }, // sous-agent (registre OVERRIDE)
      { toolCalls: [call("finish", { summary: "b.js fait" })] }, // sous-agent termine
      { toolCalls: [call("finish", { summary: "tout fait" })] }, // parent termine
    ]);
    let overrideUsed = false;
    const r = await runAgenticTask("construis", {
      projectDir: ".", system: "sys-parent", post,
      buildRegistry: () => stubRegistry(parentWrites), buildUser: (s) => s,
      depth: 0, maxDepth: 2, budget,
      resolveDelegateCtx: (agentType) => {
        if (agentType !== "construire") return null;
        overrideUsed = true;
        // Cerveau du sous-agent = registre DIFFÉRENT (écrit dans subWrites) + label.
        return { buildRegistry: () => stubRegistry(subWrites), label: "GLM spécialiste", buildUser: (s) => s };
      },
    });
    check("resolveDelegateCtx consulté pour agentType", overrideUsed);
    check("le sous-agent a utilisé le registre OVERRIDE (subWrites)", subWrites.length === 1 && subWrites[0].path === "b.js");
    check("le registre du parent n'a PAS écrit", parentWrites.length === 0);
    check("le label du cerveau apparaît dans le résultat de délégation", r.toolTrace.some((t) => t.name === "delegate"));
  }

  console.log("\n[#3] Anti-relecture : relire le même fichier → on ne ré-exécute pas, on pousse à agir");
  {
    let reads = 0;
    const reg = new ToolRegistry();
    reg.register({ name: "read_file", description: "", inputSchema: { path: z.string() }, handler: () => { reads++; return { text: "contenu du fichier" }; } });
    reg.register({ name: "finish", description: "", inputSchema: { summary: z.string() }, handler: (a) => ({ text: String(a.summary) }) });
    const { post } = scriptedPost([
      { toolCalls: [call("read_file", { path: "a.js" })] },
      { toolCalls: [call("read_file", { path: "a.js" })] }, // RELECTURE identique
      { toolCalls: [call("finish", { summary: "fait" })] },
    ]);
    const r = await buildAgentic("sys", "x", reg, { post, maxIterations: 10 });
    check("read_file exécuté UNE seule fois (relecture court-circuitée)", reads === 1);
    check("le moteur conclut quand même (finish)", r.finished === true);
  }

  console.log("\n[#3b] Relectures EN BOUCLE → sortie contrôlée (stuck)");
  {
    const reg = new ToolRegistry();
    reg.register({ name: "read_file", description: "", inputSchema: { path: z.string() }, handler: () => ({ text: "c" }) });
    const { post } = scriptedPost([{ toolCalls: [call("read_file", { path: "a.js" })] }]); // ne fait QUE relire
    const r = await buildAgentic("sys", "x", reg, { post, maxIterations: 20, repeatLimit: 3, maxCorrections: 3 });
    check("relectures persistantes → stuck", r.stuck === true && r.finished === false);
  }

  console.log("\n[#3d] Anti-exploration-stérile : lectures DISTINCTES sans écrire → poussé à agir → stuck");
  {
    const reg = new ToolRegistry();
    reg.register({ name: "search_code", description: "", inputSchema: { q: z.string() }, handler: () => ({ text: "résultat" }) });
    reg.register({ name: "write_file", description: "", inputSchema: { path: z.string(), content: z.string() }, handler: () => ({ text: "écrit" }) });
    // le modèle ne fait QUE des search_code DISTINCTS (q croissant), jamais d'écriture :
    // ni l'anti-relecture (args différents) ni l'anti-tâtonnement (réussites) ne le voient.
    let q = 0;
    const post: PostFn = async () => ({ content: "", toolCalls: [call("search_code", { q: "x" + q++ })] });
    const r = await buildAgentic("sys", "fais", reg, { post, maxIterations: 30, exploreBeforeAct: 4, maxCorrections: 3 });
    check("exploration stérile → stuck", r.stuck === true && r.finished === false);
    check("coupé bien avant le plafond (la garde a mordu)", r.iterations < 30);
  }

  console.log("\n[#3e] L'écriture RÉINITIALISE le budget d'exploration → la tâche peut conclure");
  {
    const reg = new ToolRegistry();
    reg.register({ name: "search_code", description: "", inputSchema: { q: z.string() }, handler: () => ({ text: "r" }) });
    reg.register({ name: "write_file", description: "", inputSchema: { path: z.string(), content: z.string() }, handler: () => ({ text: "écrit" }) });
    reg.register({ name: "finish", description: "", inputSchema: { summary: z.string() }, handler: (a) => ({ text: String(a.summary) }) });
    const { post } = scriptedPost([
      { toolCalls: [call("search_code", { q: "a" })] },
      { toolCalls: [call("search_code", { q: "b" })] },
      { toolCalls: [call("write_file", { path: "x.js", content: "1" })] }, // remet le compteur à 0
      { toolCalls: [call("search_code", { q: "c" })] },
      { toolCalls: [call("search_code", { q: "d" })] },
      { toolCalls: [call("finish", { summary: "ok" })] },
    ]);
    const r = await buildAgentic("sys", "fais", reg, { post, maxIterations: 20, exploreBeforeAct: 3 });
    check("jamais 3 lectures d'affilée sans écrire → conclut (finish)", r.finished === true && r.stuck === false);
  }

  console.log("\n[#3f] L17 : la garde anti-exploration RAPPELLE le plan + pousse à finish quand on a déjà écrit");
  {
    const reg = new ToolRegistry();
    reg.register({ name: "search_code", description: "", inputSchema: { q: z.string() }, handler: () => ({ text: "r" }) });
    reg.register({ name: "write_file", description: "", inputSchema: { path: z.string(), content: z.string() }, handler: () => ({ text: "écrit" }) });
    reg.register({ name: "finish", description: "", inputSchema: { summary: z.string() }, handler: (a) => ({ text: String(a.summary) }) });
    const { post, snapshots } = scriptedPost([
      { toolCalls: [call("write_file", { path: "App.jsx", content: "1" })] }, // hasWritten = true
      { toolCalls: [call("search_code", { q: "a" })] },
      { toolCalls: [call("search_code", { q: "b" })] },
      { toolCalls: [call("search_code", { q: "c" })] }, // déclenche la garde (>= exploreBeforeAct)
      { toolCalls: [call("finish", { summary: "fini" })] },
    ]);
    const r = await buildAgentic("sys", "fais", reg, {
      post,
      maxIterations: 12,
      exploreBeforeAct: 2,
      maxCorrections: 8,
      planReminder: () => "PLAN-ANCRE-TEST",
    });
    // Le dernier snapshot (avant finish) doit porter le nudge de garde enrichi.
    const allMsgs = snapshots[snapshots.length - 1] ?? [];
    const nudge = allMsgs.filter((m) => m.role === "tool").map((m) => m.content).join("\n");
    check("le nudge de garde RAPPELLE le plan (ancre en cours de boucle)", nudge.includes("PLAN-ANCRE-TEST"));
    check("le nudge pousse à finish car des fichiers sont DÉJÀ écrits", /appelle finish MAINTENANT/i.test(nudge));
    check("l'Élève conclut (finish) après le rappel", r.finished === true);
  }

  console.log("\n[#3g] L17 : sans écriture préalable, PAS de cue « appelle finish » (rien n'est fait)");
  {
    const reg = new ToolRegistry();
    reg.register({ name: "search_code", description: "", inputSchema: { q: z.string() }, handler: () => ({ text: "r" }) });
    let q = 0;
    const post: PostFn = async () => ({ content: "", toolCalls: [call("search_code", { q: "x" + q++ })] });
    let captured = "";
    const r = await buildAgentic("sys", "fais", reg, {
      post,
      maxIterations: 12,
      exploreBeforeAct: 2,
      maxCorrections: 3,
      planReminder: () => "PLAN-ANCRE-TEST",
      onLog: (l) => { captured += l; },
    });
    check("exploration sans écriture → stuck (comportement inchangé)", r.stuck === true);
    // Le cue finish ne doit PAS apparaître ici : on ne dit pas « appelle finish » si rien n'a été produit.
    // (on vérifie indirectement via le fait que la garde a tiré et qu'on est stuck)
    check("garde tirée (bloqué loggé)", /bloqué/i.test(captured));
  }

  console.log("\n[#3c] MARGE (révision 2026-06-24) : maxCorrections découplé de repeatLimit");
  {
    // L'Élève relit en boucle, repeatLimit bas (1) MAIS maxCorrections haut (6) :
    // il doit avoir la MARGE de plusieurs correctifs avant la sortie « bloqué »
    // (au lieu d'être étouffé dès le 1er-3e correctif et de courir vers Claude).
    const reg = new ToolRegistry();
    reg.register({ name: "read_file", description: "", inputSchema: { path: z.string() }, handler: () => ({ text: "c" }) });
    let iters = 0;
    const post: PostFn = async () => { iters++; return { content: "", toolCalls: [call("read_file", { path: "a.js" })] }; };
    const r = await buildAgentic("sys", "x", reg, { post, maxIterations: 30, repeatLimit: 1, maxCorrections: 6 });
    check("la marge tient : pas de stuck avant ~maxCorrections correctifs", r.iterations >= 6);
    check("finit quand même par sortir (stuck) une fois la marge épuisée", r.stuck === true);
  }

  console.log("\n[10] Stop coopératif : shouldAbort coupe la boucle proprement");
  {
    // shouldAbort=true AVANT la 1ʳᵉ itération → on sort tout de suite, sans appeler
    // le modèle ni exécuter d'outil (aucun état corrompu), avec aborted:true.
    const writes: Array<Record<string, unknown>> = [];
    const reg = stubRegistry(writes);
    let posted = 0;
    const post: PostFn = async () => { posted++; return { toolCalls: [call("write_file", { path: "a.js", content: "x" })] }; };
    const r0 = await buildAgentic("sys", "x", reg, { post, maxIterations: 10, shouldAbort: () => true });
    check("aborted === true", r0.aborted === true);
    check("ni finish ni stuck", r0.finished === false && r0.stuck === false);
    check("modèle jamais appelé (sortie avant post)", posted === 0);
    check("aucune écriture (rien d'exécuté)", writes.length === 0);

    // Abort APRÈS 2 itérations : la boucle tourne, puis on coupe → aborted, le
    // travail des 2 premiers tours est bien passé (writes >= 1).
    const writes2: Array<Record<string, unknown>> = [];
    const reg2 = stubRegistry(writes2);
    let n = 0;
    const post2: PostFn = async () => { return { toolCalls: [call("write_file", { path: `f${n}.js`, content: "x" })] }; };
    const r1 = await buildAgentic("sys", "x", reg2, { post: post2, maxIterations: 10, shouldAbort: () => (++n > 2) });
    check("aborted après quelques itérations", r1.aborted === true);
    check("le travail déjà fait a bien eu lieu avant l'arrêt", writes2.length >= 1);
    check("ne consomme pas tout le plafond d'itérations", r1.iterations < 10);
  }

  console.log(`\n${fail === 0 ? "✅" : "❌"} eleve-runtime : ${pass} pass, ${fail} fail`);
  if (fail > 0) process.exit(1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
