// Tests de la garde anti-spirale (eleve-antispiral.ts). Pur/déterministe, zéro réseau.
// On vérifie : config env (clamp + opt-out), comptage total/consécutif, cap, nudge,
// filtrage des outils d'exploration, clé d'anti-doublon, messages non vides.

import type { OpenAITool } from "./kernel-mcp.js";
import {
  selfAntiSpiralCfg, newSpiralState, recordTool, explorationCapped, dueForNudge,
  filterOutExploration, isExplorationTool, callKey, nudgeMessage, capNoticeMessage,
  duplicateExplorationMessage, DEFAULT_EXPLORATION_TOOLS, type AntiSpiralCfg,
} from "./eleve-antispiral.js";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

const cfg: AntiSpiralCfg = { explorationTools: ["read_file", "list_files", "search_code"], nudgeAfter: 3, capAfter: 6 };

function fakeTool(name: string): OpenAITool {
  return { type: "function", function: { name, description: "", parameters: {} } };
}

console.log("\n[1] Config env — défauts, clamp, opt-out");
{
  const def = selfAntiSpiralCfg({});
  check("défaut non-null", def !== null);
  check("défaut nudgeAfter=6 / capAfter=14", def!.nudgeAfter === 6 && def!.capAfter === 14);
  check("défaut explorationTools = read/list/search", JSON.stringify(def!.explorationTools) === JSON.stringify(DEFAULT_EXPLORATION_TOOLS));
  check("opt-out SELF_ANTISPIRAL=off → null", selfAntiSpiralCfg({ SELF_ANTISPIRAL: "off" }) === null);
  check("opt-out insensible à la casse (OFF)", selfAntiSpiralCfg({ SELF_ANTISPIRAL: "OFF" }) === null);
  const tuned = selfAntiSpiralCfg({ SELF_ANTISPIRAL_NUDGE: "4", SELF_ANTISPIRAL_CAP: "9" });
  check("tunable par env (4/9)", tuned!.nudgeAfter === 4 && tuned!.capAfter === 9);
  const bad = selfAntiSpiralCfg({ SELF_ANTISPIRAL_NUDGE: "-2", SELF_ANTISPIRAL_CAP: "abc" });
  check("valeurs invalides → repli 6/14", bad!.nudgeAfter === 6 && bad!.capAfter === 14);
  const inverted = selfAntiSpiralCfg({ SELF_ANTISPIRAL_NUDGE: "10", SELF_ANTISPIRAL_CAP: "4" });
  check("cap < nudge → cap remonté au nudge", inverted!.capAfter === inverted!.nudgeAfter && inverted!.capAfter === 10);
}

console.log("\n[2] isExplorationTool");
{
  check("read_file = exploration", isExplorationTool(cfg, "read_file"));
  check("search_code = exploration", isExplorationTool(cfg, "search_code"));
  check("write_file ≠ exploration", !isExplorationTool(cfg, "write_file"));
  check("check_types ≠ exploration", !isExplorationTool(cfg, "check_types"));
}

console.log("\n[3] recordTool — total monte, consécutif reset sur action");
{
  let s = newSpiralState();
  check("état initial 0/0/0", s.total === 0 && s.consecutive === 0 && s.nudges === 0);
  s = recordTool(s, cfg, "read_file");
  s = recordTool(s, cfg, "search_code");
  check("2 explorations → total=2 consécutif=2", s.total === 2 && s.consecutive === 2);
  s = recordTool(s, cfg, "write_file");
  check("une action remet consécutif à 0, total inchangé", s.consecutive === 0 && s.total === 2);
  s = recordTool(s, cfg, "read_file");
  check("nouvelle exploration → total=3 consécutif=1", s.total === 3 && s.consecutive === 1);
  // immutabilité
  const before = newSpiralState();
  recordTool(before, cfg, "read_file");
  check("recordTool est immuable (n'altère pas l'entrée)", before.total === 0 && before.consecutive === 0);
}

console.log("\n[4] explorationCapped & dueForNudge (seuils 3 / 6)");
{
  let s = newSpiralState();
  for (let i = 0; i < 3; i++) s = recordTool(s, cfg, "read_file");
  check("3 consécutives → dueForNudge true", dueForNudge(s, cfg));
  check("3 totales (<6) → pas encore cappé", !explorationCapped(s, cfg));
  for (let i = 0; i < 3; i++) s = recordTool(s, cfg, "search_code");
  check("6 totales → cappé", explorationCapped(s, cfg));
}

console.log("\n[5] filterOutExploration");
{
  const tools = ["read_file", "search_code", "list_files", "write_file", "edit_file", "check_types", "run_tests"].map(fakeTool);
  const kept = filterOutExploration(tools, cfg).map((t) => t.function.name);
  check("retire read/list/search", !kept.includes("read_file") && !kept.includes("search_code") && !kept.includes("list_files"));
  check("garde les outils d'action", kept.includes("write_file") && kept.includes("edit_file") && kept.includes("check_types") && kept.includes("run_tests"));
  check("4 outils d'action restants", kept.length === 4);
}

console.log("\n[6] callKey — anti-doublon (nom + args)");
{
  check("même nom + mêmes args → même clé", callKey("read_file", '{"path":"a.ts"}') === callKey("read_file", '{"path":"a.ts"}'));
  check("args différents → clés différentes", callKey("read_file", '{"path":"a.ts"}') !== callKey("read_file", '{"path":"b.ts"}'));
  check("nom différent → clés différentes", callKey("read_file", "{}") !== callKey("search_code", "{}"));
}

console.log("\n[7] Messages — non vides, escalade du nudge");
{
  check("nudge #1 = ton normal (« passe à l'action »)", nudgeMessage(1).includes("MAINTENANT") && !nudgeMessage(1).startsWith("⚠️ STOP"));
  check("nudge #2 = ton dur (STOP)", nudgeMessage(2).includes("STOP"));
  check("capNotice mentionne la désactivation", capNoticeMessage().includes("désactivés"));
  check("duplicate message cite l'outil", duplicateExplorationMessage("search_code").includes("search_code"));
}

const total = pass + fail;
console.log(`\n${fail === 0 ? "✅" : "❌"} eleve-antispiral : ${pass}/${total} (échecs : ${fail})`);
if (fail > 0) process.exit(1);
