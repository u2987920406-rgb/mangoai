// #193 — Route de chat FRONTIÈRE de la section Code (docs/plan-193-section-code.md,
// décision D2). Délibérément allégée par rapport à /api/chat (chat-route.ts) : pas de
// createProject/ensureRepo/commitVersion/startPreview/emitPhaseComplete/assembleSystemPrompt
// (tous workspace/goût-spécifiques, hors-sujet pour déboguer un dépôt externe quelconque).
//
// Verrou PARTAGÉ avec le Builder (agent-lock.ts) : un seul agent MangoOS actif à la fois,
// comportement voulu (pas une limitation oubliée). Modèle résolu CÔTÉ SERVEUR uniquement
// (getBrain("codeur_frontiere"), filtré contre ALLOWED_MODELS) — le client ne peut jamais
// le contourner, même en parlant directement à cette route sans passer par l'UI.
import type { Express, Request, Response } from "express";
import fs from "node:fs";
import path from "node:path";
import { flag } from "../flags.js";
import { getExternalProject } from "../external-projects.js";
import { getBrain } from "../brain/brain-registry.js";
import { runAgent, ALLOWED_MODELS, type AgentEvent, type ModelChoice } from "../agent/agent.js";
import { tryAcquireAgent, releaseAgent } from "../agent/agent-lock.js";
import { clearInterrupt } from "../interrupt.js";
import { getSession, saveSession, clearSession } from "../sessions.js";
import { appendHistory, type ChatEntry } from "../history.js";
import { dataDir } from "../safe-io.js";

/** Dossier d'historique DÉDIÉ, hors du dossier externe lui-même — décision consciente
 *  (docs/plan-193-section-code.md §4) : ne jamais écrire de .chat-history.json dans le
 *  repo de l'utilisateur, surprise minimale. */
export function externalHistoryDir(externalProjectId: string): string {
  return dataDir("external-history", externalProjectId);
}

function codeAgentSystemPrompt(dir: string): string {
  return (
    `Tu es l'agent Code de MangoOS — un ingénieur pragmatique senior. Tu travailles dans ` +
    `${dir}, un dépôt EXISTANT hors du contrôle de MangoOS (pas un projet généré par ce système). ` +
    `Respecte ses conventions déjà en place, ne réécris pas ce qui marche, explique brièvement tes changements. ` +
    `Aucun axiome de goût/design MangoOS ne s'applique ici — c'est du code externe quelconque.`
  );
}

function resolveFrontierModel(): ModelChoice {
  const configured = getBrain("codeur").model; // fusionné au lot 3 (refonte v3) — l'écran Code sort de la v3 (A3)
  return (ALLOWED_MODELS as readonly string[]).includes(configured ?? "")
    ? (configured as ModelChoice)
    : "opus";
}

export function registerCodeRoute(app: Express): void {
  // Pas de GET /api/code-chat/history/:id dédié : Chat.jsx (réutilisé tel quel par
  // CodePane) appelle TOUJOURS /api/history/:name — la branche `ext:` ajoutée dans
  // project-io-routes.ts est le vrai point d'intégration, pas un doublon ici.
  app.post("/api/code-chat", async (req: Request, res: Response) => {
    if (!flag("CODE_SECTION")) {
      res.status(403).json({ error: "section Code désactivée (CODE_SECTION=off)" });
      return;
    }
    // Chat.jsx (réutilisé tel quel par CodePane, apiPath="/api/code-chat") envoie
    // `projectName` — PAS un champ dédié `externalProjectId` (zéro changement de
    // forme de body côté client, décision D2/étape 5 du plan). On dérive l'id en
    // retirant le préfixe "ext:" que CodePane lui passe toujours en projectName.
    const body = (req.body ?? {}) as { projectName?: unknown; prompt?: unknown };
    const rawName = typeof body.projectName === "string" ? body.projectName : "";
    const externalProjectId = rawName.startsWith("ext:") ? rawName.slice(4) : "";
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    if (!externalProjectId || !prompt) {
      res.status(400).json({ error: "projectName (préfixé ext:) et prompt requis" });
      return;
    }
    const project = getExternalProject(externalProjectId);
    if (!project) {
      res.status(404).json({ error: "projet externe introuvable" });
      return;
    }
    // Acquisition ATOMIQUE (même patron que chat-route.ts, N18) : jamais de
    // isAgentBusy() séparé avant — la fenêtre entre les deux serait une vraie
    // race condition (double-acquisition).
    if (!tryAcquireAgent()) {
      res.status(409).json({ error: "Agent is already working, wait for it to finish" });
      return;
    }
    clearInterrupt();

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();
    const send = (event: unknown) => res.write(`data: ${JSON.stringify(event)}\n\n`);

    const dir = project.path;
    const histDir = externalHistoryDir(externalProjectId);
    // BUG RÉEL trouvé en vérif live (2026-07-21) : atomicWriteFileSync (safe-io.ts) ne
    // crée PAS le dossier parent — vrai pour workspace/<projet>/ (toujours déjà créé par
    // createProject) mais PAS pour ce dossier dédié, jamais créé ailleurs. ENOENT au
    // premier tour sans ce mkdirSync.
    fs.mkdirSync(histDir, { recursive: true });
    const sessionKey = `ext:${externalProjectId}`;
    const model = resolveFrontierModel();
    const turn: ChatEntry[] = [{ role: "user", text: prompt, ts: new Date().toISOString() }];

    const streamTurn = async (session?: string): Promise<"ok" | "session-not-found"> => {
      let pendingFailure: AgentEvent | null = null;
      for await (const event of runAgent(prompt, dir, session, model, "elite", null, false, undefined, codeAgentSystemPrompt(dir))) {
        if (session && event.type === "error" && /No conversation found/i.test(event.message)) {
          return "session-not-found";
        }
        if (session && event.type === "result" && !event.ok) {
          pendingFailure = event;
          continue;
        }
        if (event.type === "result" && event.sessionId) {
          saveSession(sessionKey, event.sessionId);
        }
        if (event.type === "text" && event.text.trim()) turn.push({ role: "agent", text: event.text, ts: new Date().toISOString() });
        else if (event.type === "tool") turn.push({ role: "tool", text: `${event.name} ${event.detail}`.trim(), ts: new Date().toISOString() });
        else if (event.type === "error") turn.push({ role: "error", text: event.message, ts: new Date().toISOString() });
        send(event);
      }
      if (pendingFailure) send(pendingFailure);
      return "ok";
    };

    try {
      const existing = getSession(sessionKey);
      const outcome = await streamTurn(existing);
      if (outcome === "session-not-found") {
        clearSession(sessionKey);
        await streamTurn(undefined);
      }
      appendHistory(histDir, turn);
    } catch (err) {
      send({ type: "error", message: err instanceof Error ? err.message : String(err) });
    } finally {
      releaseAgent();
      send({ type: "done" });
      res.end();
    }
  });
}
