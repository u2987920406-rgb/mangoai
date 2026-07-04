// #180 É5 — Routes serveur du consentement de coffres (D3). Ne fait QUE
// lire/écrire via les fonctions déjà exportées par perimeter.ts (É1) : aucune
// logique de résolution de chemin dupliquée ici, aucune écriture directe du
// fichier de grants (addGrantToFile/revokeGrantFromFile/loadGrants portent
// déjà l'atomicité et le fail-safe).
//
// Ces routes existent QUE le gate DESKTOP_PERIMETER soit ON ou OFF (comme les
// autres registres additifs du repo — cf. stratege-routes.ts) : elles ne
// FONT rien tant qu'aucun outil ne consulte le registre de grants ; c'est
// `confinePath`/`perimeter-context.ts` qui, lui, reste gaté. Octroyer un coffre
// gate OFF est donc sans effet observable (byte-identique) jusqu'à activation.

import type { Express, Request, Response } from "express";
import {
  addGrantToFile,
  revokeGrantFromFile,
  loadGrants,
  type GrantMode,
} from "./perimeter.js";

function isGrantMode(v: unknown): v is GrantMode {
  return v === "ro" || v === "rw";
}

/** Enregistre les routes du consentement de coffres (plan #180 É5, D3). */
export function registerPerimeterRoutes(app: Express): void {
  app.post("/api/perimeter/grant", (req: Request, res: Response) => {
    const body = (req.body ?? {}) as { path?: unknown; mode?: unknown };
    const p = typeof body.path === "string" ? body.path.trim() : "";
    if (!p) {
      res.status(400).json({ error: "path requis" });
      return;
    }
    if (!isGrantMode(body.mode)) {
      res.status(400).json({ error: "mode requis : 'ro' ou 'rw'" });
      return;
    }
    try {
      const grants = addGrantToFile(p, body.mode);
      res.json({ grants });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.delete("/api/perimeter/grant", (req: Request, res: Response) => {
    const bodyPath = (req.body ?? {}) as { path?: unknown };
    const p =
      typeof req.query.path === "string" && req.query.path.length > 0
        ? req.query.path
        : typeof bodyPath.path === "string"
        ? bodyPath.path.trim()
        : "";
    if (!p) {
      res.status(400).json({ error: "path requis (query ou body)" });
      return;
    }
    try {
      const grants = revokeGrantFromFile(p);
      res.json({ grants });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.get("/api/perimeter/grants", (_req: Request, res: Response) => {
    try {
      res.json({ grants: loadGrants() });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });
}
