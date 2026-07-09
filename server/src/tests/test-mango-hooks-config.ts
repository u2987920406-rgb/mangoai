// Tests du loader de hooks (mango-hooks-config.ts) + du branchement runGatedInvoke
// (eleve-runtime.ts) — #172, Phase 1. Déterministe : registre stub, fichiers temporaires.

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { z } from "zod";
import { ToolRegistry } from "../kernel/kernel-mcp.js";
import { loadHooks, FUNCTION_HOOKS } from "../mango-hooks-config.js";
import { runGatedInvoke } from "../eleve-runtime.js";
import type { HookRegistration } from "../mango-hooks.js";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

const tmps: string[] = [];
function tmpProject(hooksJson?: unknown): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mango-hooks-"));
  tmps.push(dir);
  if (hooksJson !== undefined) {
    fs.mkdirSync(path.join(dir, ".hooks"), { recursive: true });
    const body = typeof hooksJson === "string" ? hooksJson : JSON.stringify(hooksJson);
    fs.writeFileSync(path.join(dir, ".hooks", "hooks.json"), body, "utf8");
  }
  return dir;
}
function stubReg(capture: { name?: string; args?: Record<string, unknown> }): ToolRegistry {
  const reg = new ToolRegistry();
  reg.register({ name: "run_command", description: "", inputSchema: { command: z.string() }, handler: (a) => { capture.name = "run_command"; capture.args = a; return { text: "OK" }; } });
  reg.register({ name: "write_file", description: "", inputSchema: { path: z.string(), content: z.string() }, handler: (a) => { capture.name = "write_file"; capture.args = a; return { text: "écrit" }; } });
  return reg;
}
const preTool = (run: HookRegistration["run"], matcher?: string): HookRegistration[] => [{ event: "PreToolUse", matcher, run }];

async function main() {
  // ---- loadHooks ----
  check("fichier absent → []", loadHooks(tmpProject()).length === 0);

  const okDir = tmpProject({ PreToolUse: [{ matcher: "run_command", handler: { type: "function", ref: "block-dangerous-run" } }] });
  const okHooks = loadHooks(okDir);
  check("hook function résolu → 1", okHooks.length === 1 && okHooks[0].event === "PreToolUse" && okHooks[0].matcher === "run_command");
  check("id du hook = la ref", okHooks[0].id === "block-dangerous-run");

  check("type 'command' (non géré Phase 1) → ignoré",
    loadHooks(tmpProject({ PreToolUse: [{ handler: { type: "command", command: "./x.sh" } }] })).length === 0);
  check("ref 'function' inconnue → ignorée",
    loadHooks(tmpProject({ PreToolUse: [{ handler: { type: "function", ref: "inconnu" } }] })).length === 0);
  check("event invalide → ignoré",
    loadHooks(tmpProject({ BidonEvent: [{ handler: { type: "function", ref: "block-dangerous-run" } }] })).length === 0);
  check("JSON cassé → [] (ne lève jamais)", loadHooks(tmpProject("{ pas du json")).length === 0);

  // ---- le hook-jouet de sûreté ----
  const guard = FUNCTION_HOOKS["block-dangerous-run"];
  check("block-dangerous-run refuse 'rm -rf /'",
    guard({ event: "PreToolUse", projectDir: "", toolName: "run_command", toolInput: { command: "rm -rf /" } }).decision === "deny");
  check("block-dangerous-run laisse passer 'npm run build'",
    !guard({ event: "PreToolUse", projectDir: "", toolName: "run_command", toolInput: { command: "npm run build" } }).decision);
  check("block-dangerous-run ne concerne pas write_file",
    !guard({ event: "PreToolUse", projectDir: "", toolName: "write_file", toolInput: { command: "rm -rf /" } }).decision);

  // ---- runGatedInvoke : gate ----
  const denyHook = preTool(() => ({ decision: "deny", reason: "non" }));
  {
    const cap: { name?: string; args?: Record<string, unknown> } = {};
    const r = await runGatedInvoke(stubReg(cap), "run_command", { command: "x" }, { hooks: denyHook, enabled: false });
    check("enabled=false → invocation directe (deny ignoré)", cap.name === "run_command" && !r.isError);
  }
  {
    const cap: { name?: string; args?: Record<string, unknown> } = {};
    const r = await runGatedInvoke(stubReg(cap), "run_command", { command: "x" }, { hooks: [], enabled: true });
    check("enabled=true sans hooks → invocation directe", cap.name === "run_command" && !r.isError);
  }
  {
    const cap: { name?: string; args?: Record<string, unknown> } = {};
    const r = await runGatedInvoke(stubReg(cap), "run_command", { command: "x" }, { hooks: denyHook, enabled: true });
    check("hook deny → outil NON invoqué + message de refus", cap.name === undefined && r.isError && r.text.includes("bloquée"));
  }
  {
    const cap: { name?: string; args?: Record<string, unknown> } = {};
    const r = await runGatedInvoke(stubReg(cap), "run_command", { command: "x" }, { hooks: preTool(() => ({ decision: "allow" })), enabled: true });
    check("hook allow → outil invoqué", cap.name === "run_command" && !r.isError);
  }
  {
    const cap: { name?: string; args?: Record<string, unknown> } = {};
    await runGatedInvoke(stubReg(cap), "run_command", { command: "origine" }, { hooks: preTool(() => ({ updatedInput: { command: "MODIFIE" } })), enabled: true });
    check("updatedInput → arguments réécrits à l'invoke", cap.args?.command === "MODIFIE");
  }

  // ---- intégration loader → gate ----
  {
    const cap: { name?: string; args?: Record<string, unknown> } = {};
    const bad = await runGatedInvoke(stubReg(cap), "run_command", { command: "rm -rf /tmp/x" }, { hooks: okHooks, projectDir: okDir, enabled: true });
    check("hook-jouet chargé depuis hooks.json BLOQUE rm -rf", cap.name === undefined && bad.isError);
    const cap2: { name?: string; args?: Record<string, unknown> } = {};
    const good = await runGatedInvoke(stubReg(cap2), "run_command", { command: "npm run build" }, { hooks: okHooks, projectDir: okDir, enabled: true });
    check("hook-jouet chargé laisse passer npm build", cap2.name === "run_command" && !good.isError);
  }

  for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best-effort */ } }
  console.log(`\n✅ mango-hooks-config : ${pass} pass, ${fail} fail`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error("FATAL", e); process.exit(1); });
