// Tests du runtime agentique (eleve-runtime.buildAgentic).
// 100 % déterministe : transport `post` FAUX scripté + registre stub → zéro
// réseau, zéro vrai build. On prouve l'ordre d'invocation, la fin sur `finish`,
// l'anti-répétition (sortie contrôlée) et la compaction de contexte.

import { z } from "zod";
import { ToolRegistry } from "./kernel-mcp.js";
import { buildAgentic, type PostFn, type ChatMessage, type ToolCall } from "./eleve-runtime.js";

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
    const r = await buildAgentic("sys", "x", reg, { post, maxIterations: 30, repeatLimit: 2 });
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

  console.log(`\n${fail === 0 ? "✅" : "❌"} eleve-runtime : ${pass} pass, ${fail} fail`);
  if (fail > 0) process.exit(1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
