// Tests #175 P0/P1 : scellage d'outils (applyToolPolicy via buildEleveActionTools) +
// runSpecialistAgentic (boucle agentique bornée, deps injectées). Déterministe, sans réseau,
// sans disque (les handlers ne sont jamais invoqués — on n'inspecte que la COMPOSITION).

import { buildEleveActionTools, applyToolPolicy } from "../eleve-tools/eleve-action-tools.js"
import { ToolRegistry, type KernelTool } from "../kernel/kernel-mcp.js"
import { runSpecialistAgentic, SPECIALIST_MAX_ITER, type AgenticFn } from "../specialist/specialist-agentic.js"
import { consultSpecialist } from "../specialist/specialist-delegate.js"
import { sanitizeExternal } from "../agent/agent-contract.js"
import type { SpecialistAgent } from "../specialist/specialist-agents.js"

let pass = 0
let fail = 0
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`) }
  else { fail++; console.log(`  ✗ ${label}`) }
}

const DIR = "/tmp/proj-175" // closures seulement, jamais lu

// ---- scellage réel via buildEleveActionTools : allowlist ----
{
  const full = buildEleveActionTools(DIR, {})
  check("registre complet : write_file présent", full.has("write_file"))
  check("registre complet : run_command présent", full.has("run_command"))

  const restricted = buildEleveActionTools(DIR, { allowedTools: ["read_file", "edit_file", "check_build"] })
  check("allowlist : read_file gardé", restricted.has("read_file"))
  check("allowlist : edit_file gardé", restricted.has("edit_file"))
  check("allowlist : write_file RETIRÉ (hors liste)", !restricted.has("write_file"))
  check("allowlist : run_command RETIRÉ (hors liste)", !restricted.has("run_command"))
  check("allowlist : search_code RETIRÉ (hors liste)", !restricted.has("search_code"))
  check("allowlist : finish TOUJOURS gardé (terminaison)", restricted.has("finish"))
}

// ---- scellage réel : denylist ----
{
  const denied = buildEleveActionTools(DIR, { deniedTools: ["run_command", "add_dependency"] })
  check("denylist : run_command retiré", !denied.has("run_command"))
  check("denylist : add_dependency retiré", !denied.has("add_dependency"))
  check("denylist : write_file conservé", denied.has("write_file"))
  check("denylist : read_file conservé", denied.has("read_file"))
}

// ---- applyToolPolicy PUR ----
{
  const mk = (name: string): KernelTool => ({
    name, description: name, inputSchema: {}, handler: async () => ({ text: "" }),
  })
  const reg = new ToolRegistry()
  for (const n of ["read_file", "write_file", "run_command", "finish"]) reg.register(mk(n))
  check("policy vide → registre inchangé (même instance)", applyToolPolicy(reg, {}) === reg)
  const f = applyToolPolicy(reg, { allowedTools: ["read_file"] })
  check("allowlist pure : read_file + finish seulement",
    f.has("read_file") && f.has("finish") && !f.has("write_file") && !f.has("run_command"))
  check("allowlist pure : NOUVELLE instance (orig intacte)", f !== reg && reg.has("write_file"))
  const f2 = applyToolPolicy(reg, { deniedTools: ["finish", "read_file"] })
  check("finish protégé même en denylist", f2.has("finish") && !f2.has("read_file"))
}

// ---- runSpecialistAgentic (deps injectées) ----
const agentAction: SpecialistAgent = {
  id: "sa_test_action", name: "Réparateur test", role: "corrige des bugs",
  lacune: "L?", systemPrompt: "Tu es un réparateur. Corrige puis finish.",
  tools: [], triggers: "", examples: [], tags: [], provider: "openai",
  createdByAgent: "test", createdAt: "2026-01-01",
  mode: "action",
  toolPolicy: { allowRun: false, allowedTools: ["read_file", "edit_file", "check_build", "finish"] },
}

{
  const r = await runSpecialistAgentic("inconnu", "t", DIR, {
    agentic: async () => ({ text: "x", toolTrace: [] }),
    buildTools: buildEleveActionTools,
    getAgent: () => undefined,
  })
  check("agent introuvable → ok:false", !r.ok && /introuvable/.test(r.text))
}

{
  // Les assertions sur le registre sont calculées DANS la closure (évite le narrowing TS
  // d'une variable assignée seulement en callback async).
  let sealedOk = false
  let seenMaxIter: number | undefined
  let seenUser = ""
  let seenSystem = ""
  const spy: AgenticFn = async (system, user, registry, opts) => {
    seenSystem = system
    seenUser = user
    seenMaxIter = opts?.maxIterations
    sealedOk = !registry.has("write_file") && !registry.has("run_command")
      && registry.has("edit_file") && registry.has("finish")
    return { text: "corrigé", toolTrace: [{ name: "edit_file", args: "{}" }, { name: "finish", args: "{}" }] }
  }
  const taskInput = "Corrige le bug <script>alert(1)</script>"
  const r = await runSpecialistAgentic("sa_test_action", taskInput, DIR, {
    agentic: spy, buildTools: buildEleveActionTools, getAgent: () => agentAction,
  })
  check("action : ok + texte remonté", r.ok && r.text === "corrigé")
  check("action : toolTrace remonté", r.toolTrace.length === 2)
  check("action : budget = SPECIALIST_MAX_ITER (< 12 de l'Élève)",
    seenMaxIter === SPECIALIST_MAX_ITER && SPECIALIST_MAX_ITER < 12)
  check("action : systemPrompt de l'agent transmis", seenSystem === agentAction.systemPrompt)
  check("action : tâche passée via sanitizeExternal (entrée = donnée)", seenUser === sanitizeExternal(taskInput))
  check("action : registre SCELLÉ (write_file/run_command hors allowlist ABSENTS)", sealedOk)
}

{
  const r = await runSpecialistAgentic("sa_test_action", "t", DIR, {
    agentic: async () => { throw new Error("boum") },
    buildTools: buildEleveActionTools, getAgent: () => agentAction,
  })
  check("agentic throw → ok:false, jamais de crash", !r.ok && /boum/.test(r.text))
}

// ---- P3 : consultSpecialist choisit le runner selon le mode (câblage injecté, gate simulé) ----
{
  const actionAgent: SpecialistAgent = { ...agentAction, name: "Agent Action Délégué", tags: ["refactor"] }
  const conseilAgent: SpecialistAgent = {
    ...agentAction, id: "sa_conseil", name: "Agent Conseil", mode: undefined, toolPolicy: undefined, tags: ["refactor"],
  }
  let ranAgentic = false
  let ranAdvice = false
  const runAgentic = async (_id: string, _t: string) => { ranAgentic = true; return { ok: true, text: "j'ai agi" } }
  // Texte de conseil réaliste (≥ MIN_ADVICE_CHARS=20) — un mock trop court ("conseil", 7
  // caractères) se ferait rejeter par isUsableAdvice en mode conseil (comportement VOULU,
  // cf. test-specialist-delegate.ts [3d]) ; ce bloc teste le ROUTAGE action/conseil, pas le
  // plancher de longueur, donc le mock doit rester au-dessus du seuil pour ne pas s'y heurter.
  const run = async (_id: string, _t: string) => { ranAdvice = true; return { ok: true, text: "voici un conseil détaillé" } }

  // mode action + runAgentic fourni (gate on) → délègue l'EXÉCUTION
  const r1 = await consultSpecialist({ task: "refactor le composant", blockage: "plateau", min: 1 },
    { load: () => [actionAgent], run, runAgentic })
  check("P3 : agent action + runAgentic → EXÉCUTE (runAgentic)", ranAgentic && !ranAdvice && r1?.advice === "j'ai agi")

  // mode action MAIS pas de runAgentic (gate off) → CONSEIL (zéro régression)
  ranAgentic = false; ranAdvice = false
  const r2 = await consultSpecialist({ task: "refactor le composant", blockage: "plateau", min: 1 },
    { load: () => [actionAgent], run })
  check("P3 : action sans runAgentic (gate off) → CONSEIL (run)", !ranAgentic && ranAdvice && r2?.advice === "voici un conseil détaillé")

  // agent conseil + runAgentic dispo → reste CONSEIL (mode ≠ action)
  ranAgentic = false; ranAdvice = false
  const r3 = await consultSpecialist({ task: "refactor le composant", blockage: "plateau", min: 1 },
    { load: () => [conseilAgent], run, runAgentic })
  check("P3 : agent conseil (même si runAgentic dispo) → CONSEIL", !ranAgentic && ranAdvice && r3?.advice === "voici un conseil détaillé")
}

console.log(`\nspecialist-agentic (#175) : ${pass}/${pass + fail}`)
if (fail > 0) process.exit(1)
