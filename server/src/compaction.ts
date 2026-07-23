// Proactive context compaction, transposed from Hermes Agent's
// context_compressor.py. Hermes owns its message list and rewrites it
// (threshold % of the context window, protected head/tail, summary written by
// a cheap auxiliary model). MangoOS delegates conversation history to the
// Claude Agent SDK, so the transposition keeps Hermes' CONCEPTS and maps them
// onto SDK primitives:
//   - threshold %        → context tokens measured on the turn's last API call
//   - auxiliary summary  → /compact run with model "haiku"
//   - head/tail + structured summary → the CLI's own /compact already does it
//   - "never slow the user down"     → fire-and-forget AFTER the response,
//     same stance as review.ts; a new user message interrupts the compaction.
import { query } from "@anthropic-ai/claude-agent-sdk";
import { appendHistory } from "./history.js";
import { saveSession } from "./sessions.js";

// Compact when the conversation exceeds this share of the model's window.
// Hermes defaults to 50%; we trigger later because the SDK's own auto-compact
// is the mid-turn safety net — this pass exists to fire BETWEEN turns instead.
const THRESHOLD = Number(process.env.COMPACT_THRESHOLD ?? 0.7);

// Hermes' structured summary template, condensed into /compact instructions
// tailored to an app builder (what matters for the NEXT build iterations).
const COMPACT_INSTRUCTIONS =
  "Préserve en priorité : la demande en cours de l'utilisateur, les décisions " +
  "de design (couleurs, typo, structure des pages), la liste des fichiers du " +
  "projet et leur rôle, les conventions adoptées, les problèmes non résolus. " +
  "Compresse agressivement : contenus de fichiers déjà lus, sorties d'outils, " +
  "étapes anciennes déjà livrées avec succès. Jette les images, captures et " +
  "snapshots déjà analysés — ne garde que les conclusions textuelles des " +
  "vérifications visuelles.";

let current: ReturnType<typeof query> | null = null;
let running: Promise<void> | null = null;

// Anti-thrashing (Hermes' ineffective-compression counter, simplified): after
// a compaction, skip re-compacting until the context has grown at least 10%
// past where the last one landed — otherwise a summary that stays above the
// threshold would re-trigger on every turn.
const lastPostTokens = new Map<string, number>();

export function compactionStatus(): { running: boolean } {
  return { running: running !== null };
}

/** Interrupts an in-flight compaction (if any) and waits until it is fully
 * done, so the caller can safely start a new turn on the session. */
export async function interruptCompaction(): Promise<void> {
  if (!running) return;
  try {
    await current?.interrupt();
  } catch {
    // already finishing — just wait below
  }
  await running.catch(() => {});
}

/** Fire-and-forget: compacts the project's session when the context exceeds
 * the threshold. Renvoie la promesse quand une compaction démarre, `null` sinon
 * (aucun appelant n'utilisait le `boolean` d'avant — 2026-07-23, #0.4, audit
 * fault-finding — suivable via turn-ledger.ts::trackDeferred sans retarder qui
 * que ce soit). */
export function maybeCompactSession(
  projectName: string,
  projectDir: string,
  sessionId: string,
  contextTokens: number,
  contextWindow: number,
): Promise<void> | null {
  if (running || !sessionId || !contextTokens || !contextWindow) return null;
  if (contextTokens < contextWindow * THRESHOLD) return null;
  const floor = lastPostTokens.get(projectName);
  if (floor && contextTokens <= floor * 1.1) return null;

  console.log(
    `[compact] ${projectName}: context at ${Math.round((contextTokens / contextWindow) * 100)}% ` +
      `(${fmtK(contextTokens)}/${fmtK(contextWindow)} tokens) — compacting in background`,
  );
  running = (async () => {
    try {
      const q = query({
        prompt: `/compact ${COMPACT_INSTRUCTIONS}`,
        options: {
          cwd: projectDir,
          // Hermes pattern: the summary is written by the cheap auxiliary model.
          model: "haiku",
          maxTurns: 2,
          resume: sessionId,
          allowedTools: ["Read"],
          systemPrompt: { type: "preset", preset: "claude_code" },
        },
      });
      current = q;
      let newSessionId = "";
      let pre = 0;
      let post = 0;
      // Only a compact_boundary proves the compaction ran — a "success" result
      // alone also covers cases like "Not enough messages to compact."
      let compacted = false;
      for await (const message of q) {
        if (message.type === "system" && message.subtype === "compact_boundary") {
          compacted = true;
          pre = message.compact_metadata.pre_tokens;
          post = message.compact_metadata.post_tokens ?? 0;
        } else if (message.type === "result") {
          newSessionId = message.session_id;
        }
      }
      if (!compacted || !newSessionId) {
        console.warn(`[compact] ${projectName}: nothing was compacted — session kept as-is`);
        return;
      }
      // Resume keeps the session id by default, but save whatever came back.
      saveSession(projectName, newSessionId);
      lastPostTokens.set(projectName, post || Math.round(contextTokens * 0.3));
      const detail = post ? ` (${fmtK(pre || contextTokens)} → ${fmtK(post)} tokens)` : "";
      console.log(`[compact] ${projectName}: done${detail}`);
      // Visible on the next history reload, like the review's 🧠 line.
      appendHistory(projectDir, [
        { role: "status", text: `🗜 Contexte compressé${detail}`, ts: new Date().toISOString() },
      ]);
    } catch (err) {
      console.warn("[compact]", err instanceof Error ? err.message : err);
    } finally {
      current = null;
      running = null;
    }
  })();
  return running;
}

function fmtK(n: number): string {
  return `${Math.round(n / 1000)}k`;
}
