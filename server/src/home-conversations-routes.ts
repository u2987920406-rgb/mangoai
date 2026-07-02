import type { Express, Request, Response } from "express";
import {
  listHomeConversations,
  loadHomeConversation,
  saveHomeConversation,
  cleanHomeScratch,
} from "./home-scratch.js";

// Écran « Conversation » du shell 2.0 : lister / rouvrir / supprimer les discussions
// d'accueil sauvegardées automatiquement (auto-save côté client à chaque tour).
export function registerHomeConversationsRoutes(app: Express): void {
  app.get("/api/home/conversations", (_req: Request, res: Response) => {
    res.json(listHomeConversations());
  });

  app.get("/api/home/conversations/:convId", (req: Request, res: Response) => {
    res.json(loadHomeConversation(req.params["convId"] as string));
  });

  app.post("/api/home/conversations/:convId", (req: Request, res: Response) => {
    const messages = (req.body as { messages?: Array<{ role: string; content: string }> })?.messages;
    if (!Array.isArray(messages)) {
      res.status(400).json({ error: "messages required" });
      return;
    }
    saveHomeConversation(req.params["convId"] as string, messages);
    res.json({ ok: true });
  });

  app.delete("/api/home/conversations/:convId", (req: Request, res: Response) => {
    cleanHomeScratch(req.params["convId"] as string);
    res.json({ ok: true });
  });
}
