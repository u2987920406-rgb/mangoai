// Tests du cœur pur des hooks Mango (#172, Phase 0) — mango-hooks.ts.
// Aucun branchement : on exécute le dispatcher sur des handlers bidons injectés.
// Couvre : matcher, sélection+dédup, agrégation des décisions, fail-open (plante/timeout),
// updatedInput (fusion + propagation séquentielle + confinement à PreToolUse).

import {
  matchesMatcher,
  selectHooks,
  runHooks,
  fireObservationHook,
  type HookRegistration,
  type MangoHookInput,
} from "../mango-hooks.js";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function reg(over: Partial<HookRegistration> & Pick<HookRegistration, "event" | "run">): HookRegistration {
  return { ...over };
}
function input(over: Partial<MangoHookInput> & Pick<MangoHookInput, "event">): MangoHookInput {
  return { projectDir: "/tmp/p", ...over };
}

async function main() {
  // ---- matchesMatcher ----
  check("matcher '*' matche tout", matchesMatcher("*", "read_file"));
  check("matcher absent matche tout", matchesMatcher(undefined, "read_file"));
  check("matcher '' matche tout (PreFinish sans toolName)", matchesMatcher("", undefined));
  check("égalité stricte OK", matchesMatcher("run_command", "run_command"));
  check("égalité stricte KO", !matchesMatcher("run_command", "read_file"));
  check("liste 'a|b' matche b", matchesMatcher("read_file|write_file", "write_file"));
  check("liste 'a|b' ne matche pas c", !matchesMatcher("read_file|write_file", "search_code"));
  check("glob 'read_*' matche read_file", matchesMatcher("read_*", "read_file"));
  check("glob 'read_*' ne matche pas write_file", !matchesMatcher("read_*", "write_file"));
  check("matcher nommé + toolName absent = KO", !matchesMatcher("run_command", undefined));

  // ---- selectHooks ----
  const noop = () => ({});
  const set: HookRegistration[] = [
    reg({ id: "g1", event: "PreToolUse", matcher: "run_command", run: noop }),
    reg({ id: "g1", event: "PreToolUse", matcher: "run_command", run: noop }), // doublon id → écarté
    reg({ event: "PreToolUse", matcher: "*", run: noop }),                     // sans id → gardé
    reg({ event: "PostToolUse", matcher: "*", run: noop }),                    // autre event → écarté
    reg({ event: "PreToolUse", matcher: "read_file", run: noop }),            // matcher KO pour run_command
  ];
  const sel = selectHooks(set, "PreToolUse", "run_command");
  check("selectHooks filtre event + matcher + dédup id → 2", sel.length === 2);
  check("selectHooks garde le hook '*'", sel.some((h) => h.matcher === "*"));
  check("selectHooks écarte l'autre event", !sel.some((h) => h.event !== "PreToolUse"));
  check("selectHooks sur event vide → 0", selectHooks(set, "OnEscalate", undefined).length === 0);

  // ---- runHooks : agrégation ----
  const allowOnly = await runHooks(input({ event: "PreFinish" }), [
    reg({ event: "PreFinish", run: () => ({ decision: "allow" }) }),
  ]);
  check("allow seul → allow, ran 1", allowOnly.decision === "allow" && allowOnly.ran === 1);

  const empty = await runHooks(input({ event: "PreFinish" }), []);
  check("aucun handler → allow, ran 0", empty.decision === "allow" && empty.ran === 0);

  const denied = await runHooks(input({ event: "PreToolUse", toolName: "run_command" }), [
    reg({ event: "PreToolUse", run: () => ({ decision: "allow" }) }),
    reg({ event: "PreToolUse", run: () => ({ decision: "deny", reason: "rm -rf interdit" }) }),
  ]);
  check("un deny parmi des allow → deny", denied.decision === "deny");
  check("deny remonte sa raison", denied.reasons.includes("rm -rf interdit"));

  const asked = await runHooks(input({ event: "PreToolUse", toolName: "x" }), [
    reg({ event: "PreToolUse", run: () => ({ decision: "ask", reason: "confirme ?" }) }),
  ]);
  check("ask seul → ask", asked.decision === "ask" && asked.reasons.includes("confirme ?"));

  const denyOverAsk = await runHooks(input({ event: "PreToolUse", toolName: "x" }), [
    reg({ event: "PreToolUse", run: () => ({ decision: "ask" }) }),
    reg({ event: "PreToolUse", run: () => ({ decision: "deny" }) }),
  ]);
  check("deny l'emporte sur ask", denyOverAsk.decision === "deny");

  // ---- runHooks : fail-open ----
  const throws = await runHooks(input({ event: "PostToolUse", toolName: "x" }), [
    reg({ event: "PostToolUse", run: () => { throw new Error("boom"); } }),
    reg({ event: "PostToolUse", run: () => ({ decision: "allow" }) }),
  ]);
  check("handler qui plante → fail-open (errors 1, decision allow)", throws.decision === "allow" && throws.errors === 1 && throws.ran === 2);

  const timedOut = await runHooks(
    input({ event: "PreToolUse", toolName: "x" }),
    [reg({ event: "PreToolUse", timeoutMs: 15, run: async () => { await sleep(60); return { decision: "deny" }; } })],
  );
  check("handler qui timeout → fail-open (deny ignoré)", timedOut.decision === "allow" && timedOut.errors === 1);

  const fastEnough = await runHooks(
    input({ event: "PreToolUse", toolName: "x" }),
    [reg({ event: "PreToolUse", timeoutMs: 80, run: async () => { await sleep(5); return { decision: "deny", reason: "ok" }; } })],
  );
  check("handler sous le timeout → sa décision compte", fastEnough.decision === "deny" && fastEnough.errors === 0);

  const voidReturn = await runHooks(input({ event: "PostToolUse", toolName: "x" }), [
    reg({ event: "PostToolUse", run: () => { /* observateur, ne renvoie rien */ } }),
  ]);
  check("handler qui ne renvoie rien → allow, 0 erreur", voidReturn.decision === "allow" && voidReturn.errors === 0);

  // ---- runHooks : updatedInput ----
  const merged = await runHooks(
    input({ event: "PreToolUse", toolName: "write_file", toolInput: { path: "a.ts", content: "x" } }),
    [
      reg({ event: "PreToolUse", run: () => ({ updatedInput: { content: "y" } }) }),
      reg({ event: "PreToolUse", run: () => ({ updatedInput: { extra: 1 } }) }),
    ],
  );
  check("updatedInput fusionné (path gardé, content réécrit, extra ajouté)",
    !!merged.updatedInput && merged.updatedInput.path === "a.ts" && merged.updatedInput.content === "y" && merged.updatedInput.extra === 1);

  const propagated = await runHooks(
    input({ event: "PreToolUse", toolName: "x", toolInput: {} }),
    [
      reg({ event: "PreToolUse", run: () => ({ updatedInput: { step: 1 } }) }),
      reg({ event: "PreToolUse", run: (i) => ({ updatedInput: { saw: (i.toolInput as any)?.step === 1 ? "yes" : "no" } }) }),
    ],
  );
  check("updatedInput propagé séquentiellement (hook 2 voit la modif du hook 1)",
    !!propagated.updatedInput && propagated.updatedInput.saw === "yes");

  const noMutation = await runHooks(input({ event: "PreToolUse", toolName: "x", toolInput: { a: 1 } }), [
    reg({ event: "PreToolUse", run: () => ({ decision: "allow" }) }),
  ]);
  check("pas d'updatedInput si aucun hook ne modifie → undefined", noMutation.updatedInput === undefined);

  const denyDropsUpdate = await runHooks(input({ event: "PreToolUse", toolName: "x", toolInput: { a: 1 } }), [
    reg({ event: "PreToolUse", run: () => ({ decision: "deny", updatedInput: { a: 2 } }) }),
  ]);
  check("un deny n'applique pas son updatedInput", denyDropsUpdate.decision === "deny" && denyDropsUpdate.updatedInput === undefined);

  const notPreTool = await runHooks(input({ event: "PostToolUse", toolName: "x", toolInput: { a: 1 } }), [
    reg({ event: "PostToolUse", run: () => ({ updatedInput: { a: 2 } }) }),
  ]);
  check("updatedInput ignoré hors PreToolUse", notPreTool.updatedInput === undefined);

  // ---- runHooks : matcher au dispatch ----
  const filtered = await runHooks(input({ event: "PreToolUse", toolName: "read_file" }), [
    reg({ event: "PreToolUse", matcher: "run_command", run: () => ({ decision: "deny" }) }),
  ]);
  check("hook sur 'run_command' ne s'exécute pas pour 'read_file'", filtered.decision === "allow" && filtered.ran === 0);

  // ---- fireObservationHook (Phase 5 : événements de cycle de vie) ----
  const obsEmpty = await fireObservationHook("OnBlock", "/tmp/p", "plateau", []);
  check("fireObservationHook sans hooks → no-op (ran 0)", obsEmpty.ran === 0);
  let seenDetail = "";
  const obsRan = await fireObservationHook("OnEscalate", "/tmp/p", "build cassé", [
    reg({ event: "OnEscalate", run: (i) => { seenDetail = String(i.detail); } }),
  ]);
  check("fireObservationHook exécute le hook + transmet le detail", obsRan.ran === 1 && seenDetail === "build cassé");
  const obsThrow = await fireObservationHook("OnGapRecorded", "/tmp/p", "x", [
    reg({ event: "OnGapRecorded", run: () => { throw new Error("boom"); } }),
  ]);
  check("fireObservationHook fail-open (hook qui plante → errors, ne lève jamais)", obsThrow.errors === 1);

  console.log(`\n✅ mango-hooks : ${pass} pass, ${fail} fail`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error("FATAL", e); process.exit(1); });
