// Tests B0.2 — État de travail structuré (working-memory.ts) + intégration dans
// buildAgentic (eleve-runtime.ts) sous le gate ELEVE_ETAT.
// 100 % déterministe : transport `post` FAUX scripté, registre stub. Prouve :
//  - updateWorkingState accumule les bons fichiers (pure)
//  - formatWorkingState reste BORNÉ (cap dur)
//  - gate ON  → un message d'état apparaît APRÈS compaction, JAMAIS empilé
//  - gate OFF → séquence de messages STRICTEMENT identique (aucun message ajouté)

import { z } from "zod";
import { ToolRegistry } from "./kernel-mcp.js";
import { buildAgentic, type PostFn, type ChatMessage, type ToolCall } from "./eleve-runtime.js";
import { emptyWorkingState, updateWorkingState, formatWorkingState } from "./working-memory.js";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

function call(name: string, args: object): ToolCall {
  return { id: `c_${name}_${Math.random().toString(36).slice(2, 6)}`, function: { name, arguments: JSON.stringify(args) } };
}

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

function stubRegistry(): ToolRegistry {
  const reg = new ToolRegistry();
  reg.register({ name: "write_file", description: "", inputSchema: { path: z.string(), content: z.string() }, handler: (a) => ({ text: `écrit ${a.path}` }) });
  reg.register({ name: "read_big", description: "", inputSchema: {}, handler: () => ({ text: "X".repeat(1000) }) });
  reg.register({ name: "finish", description: "", inputSchema: { summary: z.string() }, handler: (a) => ({ text: String(a.summary) }) });
  return reg;
}

async function run() {
  console.log("\n[1] updateWorkingState (pure) : accumule fichiers, erreur, plan, compteur");
  {
    let s = emptyWorkingState();
    check("état initial vide", s.fichiersEcrits.length === 0 && s.nbOutils === 0);
    s = updateWorkingState(s, "write_file", { path: "a.js", content: "x" }, false, "étape 1");
    check("write_file réussi → fichier accumulé", s.fichiersEcrits.join(",") === "a.js");
    check("plan mémorisé", s.planRappel === "étape 1");
    check("compteur incrémenté", s.nbOutils === 1);
    s = updateWorkingState(s, "edit_file", { path: "b.js" }, false, "étape 2");
    check("edit_file réussi → 2e fichier accumulé (ordre conservé)", s.fichiersEcrits.join(",") === "a.js,b.js");
    s = updateWorkingState(s, "write_file", { path: "a.js" }, false);
    check("réécrire le MÊME fichier ne duplique pas", s.fichiersEcrits.join(",") === "a.js,b.js");
    check("planReminder absent → garde le dernier connu", s.planRappel === "étape 2");
    s = updateWorkingState(s, "read_file", { path: "c.js" }, false);
    check("lecture réussie n'accumule PAS de fichier écrit", s.fichiersEcrits.join(",") === "a.js,b.js");
    s = updateWorkingState(s, "write_file", { path: "d.js" }, true);
    check("écriture EN ÉCHEC n'accumule pas de fichier", s.fichiersEcrits.join(",") === "a.js,b.js");
    check("écriture en échec renseigne la dernière erreur", s.derniereErreur === "write_file a échoué");
    check("nbOutils compte TOUS les appels (5)", s.nbOutils === 5);
  }

  console.log("\n[2] formatWorkingState : contenu lisible + BORNÉ (cap dur)");
  {
    let s = emptyWorkingState();
    const empty = formatWorkingState(s);
    check("état vide → mentionne l'absence de fichier", /aucun fichier/i.test(empty));
    check("état vide reste sous le cap par défaut", empty.length <= 600);

    for (let i = 0; i < 200; i++) s = updateWorkingState(s, "write_file", { path: `fichier-tres-long-numero-${i}.jsx` }, false);
    const long = formatWorkingState(s, 200);
    check("liste énorme → sortie quand même bornée au maxChars demandé", long.length <= 200);
    check("troncature signalée", long.includes("tronqué"));

    const s2 = updateWorkingState(emptyWorkingState(), "write_file", { path: "a.js" }, false);
    const capped = formatWorkingState(s2, 40);
    check("cap TRÈS bas respecté même avec peu de contenu", capped.length <= 40);
  }

  console.log("\n[3] Gate ON (ELEVE_ETAT=on) : un message d'état apparaît APRÈS compaction, jamais empilé");
  {
    const prevEnv = process.env.ELEVE_ETAT;
    process.env.ELEVE_ETAT = "on";
    try {
      const reg = stubRegistry();
      const { post, snapshots } = scriptedPost([
        { toolCalls: [call("write_file", { path: "App.jsx", content: "1" })] },
        { toolCalls: [call("read_big", {})] }, // répété jusqu'au plafond → grossit le contexte
      ]);
      const r = await buildAgentic("sys", "construis", reg, {
        post, maxIterations: 8, ctxMaxChars: 800, maxToolResult: 4000, repeatLimit: 999,
      });
      const withState = snapshots.filter((snap) => snap.some((m) => m.content.startsWith("ÉTAT DE TRAVAIL")));
      check("au moins un tour du modèle a vu le message d'état", withState.length > 0);
      const lastSnap = snapshots[snapshots.length - 1];
      const stateMsgs = lastSnap.filter((m) => m.content.startsWith("ÉTAT DE TRAVAIL"));
      check("JAMAIS empilé : un seul message d'état dans le dernier snapshot", stateMsgs.length === 1);
      check("le message d'état liste bien App.jsx", stateMsgs[0]?.content.includes("App.jsx") ?? false);
      check("le message d'état est inséré juste après le system initial (index 1)", lastSnap[0].role === "system" && lastSnap[1].role === "system" && lastSnap[1].content.startsWith("ÉTAT DE TRAVAIL"));
      check("le message system ORIGINAL (index 0) reste intact", lastSnap[0].content === "sys");
      check("la boucle continue de fonctionner normalement (itérations consommées)", r.iterations > 0);
    } finally {
      if (prevEnv === undefined) delete process.env.ELEVE_ETAT; else process.env.ELEVE_ETAT = prevEnv;
    }
  }

  console.log("\n[4] Gate OFF (défaut) : séquence de messages STRICTEMENT identique (aucun ajout)");
  {
    const prevEnv = process.env.ELEVE_ETAT;
    delete process.env.ELEVE_ETAT; // gate OFF = défaut explicite
    try {
      const reg = stubRegistry();
      const { post, snapshots } = scriptedPost([
        { toolCalls: [call("write_file", { path: "App.jsx", content: "1" })] },
        { toolCalls: [call("read_big", {})] },
      ]);
      await buildAgentic("sys", "construis", reg, {
        post, maxIterations: 8, ctxMaxChars: 800, maxToolResult: 4000, repeatLimit: 999,
      });
      const anyStateMsg = snapshots.some((snap) => snap.some((m) => m.content.startsWith("ÉTAT DE TRAVAIL")));
      check("aucun message d'état, jamais (gate off)", !anyStateMsg);
      const lastSnap = snapshots[snapshots.length - 1];
      check("index 1 reste le message USER d'origine (rien inséré)", lastSnap[1].role === "user" && lastSnap[1].content === "construis");
    } finally {
      if (prevEnv === undefined) delete process.env.ELEVE_ETAT; else process.env.ELEVE_ETAT = prevEnv;
    }
  }

  console.log("\n[5] Rétrocompatibilité stricte : off vs off-implicite → même comportement observable");
  {
    // Deux runs identiques, l'un avec ELEVE_ETAT explicitement "off", l'autre sans
    // la variable du tout : mêmes traces d'outils, mêmes textes finaux.
    const runOnce = async (envVal: string | undefined) => {
      const prevEnv = process.env.ELEVE_ETAT;
      if (envVal === undefined) delete process.env.ELEVE_ETAT; else process.env.ELEVE_ETAT = envVal;
      try {
        const reg = stubRegistry();
        const { post } = scriptedPost([
          { toolCalls: [call("write_file", { path: "a.js", content: "x" })] },
          { toolCalls: [call("finish", { summary: "fini" })] },
        ]);
        return await buildAgentic("sys", "x", reg, { post, maxIterations: 10 });
      } finally {
        if (prevEnv === undefined) delete process.env.ELEVE_ETAT; else process.env.ELEVE_ETAT = prevEnv;
      }
    };
    const rExplicitOff = await runOnce("off");
    const rImplicitOff = await runOnce(undefined);
    check("même texte final", rExplicitOff.text === rImplicitOff.text);
    check("même trace d'outils", JSON.stringify(rExplicitOff.toolTrace) === JSON.stringify(rImplicitOff.toolTrace));
    check("même nombre d'itérations", rExplicitOff.iterations === rImplicitOff.iterations);
  }

  console.log(`\n${fail === 0 ? "✅" : "❌"} working-memory : ${pass} pass, ${fail} fail`);
  if (fail > 0) process.exit(1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
