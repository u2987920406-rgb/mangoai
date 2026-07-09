// Route de chat multi-tours avec l'Esthète (agent système, esthete-agent.ts).
//
//   POST   /api/esthete/:projectName            → SSE : conversation (voit la preview, retouche)
//   GET    /api/esthete/:projectName/history     → { entries }
//   DELETE /api/esthete/:projectName/history     → { ok } (nouvelle conversation)
//
// N'utilise PAS runSpecialistAgentic (specialist-agentic.ts) directement : ce module
// n'expose pas de callback onTool (opts figé à {model, maxIterations}), nécessaire ici
// pour streamer les appels d'outils en SSE au fil de la conversation. On appelle donc
// askEleveAgentic directement, avec le même budget borné (SPECIALIST_MAX_ITER) et la
// même toolPolicy scellée que le reste des agents #175 — même garantie de sûreté,
// juste sans l'indirection qui masquerait le streaming.
import type { Express, Request, Response } from "express";
import { askEleveAgentic } from "./eleve.js";
import { getSpecialist } from "./specialist/specialist-agents.js";
import { sanitizeExternal } from "./agent/agent-contract.js";
import { ESTHETE_AGENT_ID, buildEstheteTools, ESTHETE_TOOL_POLICY } from "./esthete-agent.js";
import { SPECIALIST_MAX_ITER } from "./specialist/specialist-agentic.js";

// (V3-1, 2026-07-03) budget DÉDIÉ du super agent de finition : 6 itérations (le cap
// des spécialistes forgés) coupaient une passe de polish sérieuse en plein vol —
// regarder + retoucher + re-regarder + vérifier le parcours consomme déjà 5-6 appels.
const ESTHETE_MAX_ITER = Math.max(SPECIALIST_MAX_ITER, Number(process.env.ESTHETE_MAX_ITER ?? 10));
import { loadEstheteHistory, appendEstheteHistory, clearEstheteHistory } from "./esthete-history.js";
import type { ChatEntry } from "./history.js";
import { projectDir, projectExists, WORKSPACE_DIR } from "./projects.js";
import { startPreview } from "./preview.js";
import { inferProjectType } from "./blueprints.js";
import { runClosureGate, evaluateGate } from "./eleve-gate.js";

export const MAX_HISTORY_CONTEXT = 12; // derniers tours repris dans le contexte texte (fenêtre glissante)
const GATE_RELANCE_MAX = Number(process.env.ELEVE_GATE_RELANCE_MAX ?? 2);

// Verrou par PROJET (pas global comme /api/chat) : l'Esthète d'un projet ne doit pas
// bloquer celui d'un autre pendant qu'il tourne.
const busyByProject = new Map<string, boolean>();

function nowIso(): string {
  return new Date().toISOString();
}

/** Reconstruit un contexte texte à partir des derniers tours — l'Esthète n'a pas de
 *  session native multi-tours (askEleveAgentic est stateless par appel), comme
 *  consultSpecialist le fait déjà pour un sous-problème. Exportée (PURE) pour test. */
export function buildTask(history: ChatEntry[], message: string): string {
  const recent = history.slice(-MAX_HISTORY_CONTEXT);
  if (recent.length === 0) return sanitizeExternal(message);
  const transcript = recent
    .filter((e) => e.role === "user" || e.role === "agent")
    .map((e) => `${e.role === "user" ? "Utilisateur" : "Esthète"} : ${e.text}`)
    .join("\n");
  return `Conversation en cours (contexte, ne pas répéter) :\n${sanitizeExternal(transcript)}\n\nNouveau message de l'utilisateur :\n${sanitizeExternal(message)}`;
}

export function registerEstheteRoutes(app: Express): void {
  app.get("/api/esthete/:projectName/history", (req: Request, res: Response) => {
    const name = req.params["projectName"] as string;
    if (!projectExists(name)) { res.status(404).json({ error: "projet introuvable" }); return; }
    res.json({ entries: loadEstheteHistory(projectDir(name)) });
  });

  app.delete("/api/esthete/:projectName/history", (req: Request, res: Response) => {
    const name = req.params["projectName"] as string;
    if (!projectExists(name)) { res.status(404).json({ error: "projet introuvable" }); return; }
    clearEstheteHistory(projectDir(name));
    res.json({ ok: true });
  });

  app.post("/api/esthete/:projectName", async (req: Request, res: Response) => {
    const name = req.params["projectName"] as string;
    const message = String((req.body as { message?: unknown })?.message ?? "").trim();
    if (!projectExists(name)) { res.status(404).json({ error: "projet introuvable" }); return; }
    if (!message) { res.status(400).json({ error: "message requis" }); return; }
    if (busyByProject.get(name)) { res.status(409).json({ error: "L'Esthète travaille déjà sur ce projet, attends qu'il finisse." }); return; }

    const agent = getSpecialist(ESTHETE_AGENT_ID);
    if (!agent) { res.status(500).json({ error: "Agent Esthète introuvable (seed manqué au boot)." }); return; }

    const dir = projectDir(name);
    busyByProject.set(name, true);

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();
    const send = (event: unknown) => res.write(`data: ${JSON.stringify(event)}\n\n`);

    const turn: ChatEntry[] = [{ role: "user", text: message, ts: nowIso() }];

    try {
      // Démarre l'aperçu du projet — même pool que le Builder et que vois_ecran,
      // aucune nouvelle infra. Sert surtout à réchauffer le serveur avant le 1er regard.
      try {
        const { url } = await startPreview(dir);
        send({ type: "preview", url });
      } catch {
        /* pas bloquant : l'agent peut échouer son propre vois_ecran s'il en a besoin */
      }

      const history = loadEstheteHistory(dir);
      const task = buildTask(history, message);
      const registry = buildEstheteTools(dir, agent.toolPolicy ?? ESTHETE_TOOL_POLICY);

      let result = await askEleveAgentic(agent.systemPrompt, task, registry, {
        maxIterations: ESTHETE_MAX_ITER,
        model: agent.model,
        onTool: (toolName, args) => send({ type: "tool", name: toolName, args }),
      });

      // Gardien #161 — même wiring que eleve.ts : intention + goût + QA, relance bornée.
      let relances = 0;
      if (process.env.ELEVE_CLOSURE_GATE === "on") {
        let verdict = await runClosureGate(dir, task, result, WORKSPACE_DIR, inferProjectType(message));
        while (!verdict.ok && relances < GATE_RELANCE_MAX) {
          const decision = evaluateGate(dir, verdict, relances, GATE_RELANCE_MAX);
          if (decision.action !== "corrige") break;
          relances++;
          send({ type: "status", text: `Gardien : correction ${relances}/${GATE_RELANCE_MAX}` });
          result = await askEleveAgentic(agent.systemPrompt, decision.nudge, registry, {
            maxIterations: ESTHETE_MAX_ITER,
            model: agent.model,
            onTool: (toolName, args) => send({ type: "tool", name: toolName, args }),
          });
          verdict = await runClosureGate(dir, task, result, WORKSPACE_DIR, inferProjectType(message));
        }
      }

      const replyText = result.text || "(pas de réponse texte — vérifie le trace des outils)";
      send({ type: "text", text: replyText });
      send({ type: "result", ok: true });

      turn.push({ role: "agent", text: replyText, ts: nowIso() });
      appendEstheteHistory(dir, turn);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      send({ type: "error", message: msg });
      turn.push({ role: "error", text: msg, ts: nowIso() });
      appendEstheteHistory(dir, turn);
    } finally {
      busyByProject.delete(name);
      res.end();
    }
  });
}
