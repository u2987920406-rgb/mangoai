// Chargement des hooks depuis la config projet — #172, Phase 1.
//
// Lit <projectDir>/.hooks/hooks.json (même esprit que .claude/settings.json) et RÉSOUT
// chaque entrée en un HookRegistration exécutable. Format du fichier (plan §3) :
//   { "PreToolUse": [ { "matcher": "run_command",
//                       "handler": { "type": "function", "ref": "block-dangerous-run" } } ] }
//
// Phase 1 = résolveur "function" (fonctions in-process nommées, sûres, déterministes).
// Les résolveurs "command" (sandbox node --permission, cf. mango-self.ts) et "prompt"
// (askLLM) viendront dans un incrément suivant — une entrée d'un type non encore résolu
// est simplement IGNORÉE (jamais une erreur). Ne lève JAMAIS (fichier absent/illisible → []).

import fs from "node:fs";
import path from "node:path";
import type { HookRegistration, MangoHookEvent, MangoHookInput, MangoHookOutput } from "./mango-hooks.js";

const VALID_EVENTS: MangoHookEvent[] = [
  "PreToolUse", "PostToolUse", "OnBlock", "PreFinish", "OnEscalate", "OnGapRecorded",
];

/**
 * Registre des handlers de type "function" — résolus par `ref`. Déterministes, in-process.
 * C'est ici que les gardes migreront (Phase 2+ : runClosureGate, anti-spirale…). Pour
 * l'instant : une garde de sûreté de démonstration + point d'extension.
 */
export const FUNCTION_HOOKS: Record<string, (input: MangoHookInput) => MangoHookOutput> = {
  // Refuse un run_command manifestement destructif (rm -rf, rmdir /s, del /s/q, format,
  // fork-bomb). Filet de sûreté déclaratif — le confinement de chemins reste la garantie forte.
  "block-dangerous-run": (input) => {
    if (input.toolName !== "run_command") return {};
    const cmd = String((input.toolInput as Record<string, unknown> | undefined)?.command ?? "").toLowerCase();
    const danger = [/\brm\s+-rf\b/, /\brmdir\s+\/s\b/, /\bdel\s+\/[sq]\b/, /\bformat\s+[a-z]:/, /:\(\)\s*\{\s*:\s*\|/];
    if (danger.some((rx) => rx.test(cmd))) {
      return { decision: "deny", reason: `commande destructive refusée : « ${cmd.slice(0, 60)} »` };
    }
    return {};
  },
};

interface RawEntry {
  matcher?: string;
  handler?: { type?: string; ref?: string; command?: string; prompt?: string };
  timeoutMs?: number;
}

/** Résout une entrée brute en handler exécutable, ou null si le type n'est pas (encore) géré. */
function resolveHandler(entry: RawEntry): HookRegistration["run"] | null {
  const h = entry.handler;
  if (!h || !h.type) return null;
  if (h.type === "function" && h.ref && FUNCTION_HOOKS[h.ref]) return FUNCTION_HOOKS[h.ref];
  // "command" / "prompt" : résolveurs à venir (Phase 1 se limite à "function").
  return null;
}

/**
 * Charge et résout les hooks d'un projet. Pur du point de vue de l'appelant (l'I/O est ici),
 * ne lève JAMAIS : tout problème (pas de fichier, JSON cassé, type inconnu) → liste partielle
 * ou vide. `id` = la ref (utile pour la déduplication du dispatcher).
 */
export function loadHooks(projectDir: string): HookRegistration[] {
  try {
    const file = path.join(projectDir, ".hooks", "hooks.json");
    if (!fs.existsSync(file)) return [];
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
    const out: HookRegistration[] = [];
    for (const event of VALID_EVENTS) {
      const list = parsed[event];
      if (!Array.isArray(list)) continue;
      for (const entry of list as RawEntry[]) {
        const run = resolveHandler(entry);
        if (!run) continue;
        out.push({
          event,
          matcher: entry.matcher,
          run,
          id: entry.handler?.ref,
          timeoutMs: entry.timeoutMs,
        });
      }
    }
    return out;
  } catch {
    return [];
  }
}
