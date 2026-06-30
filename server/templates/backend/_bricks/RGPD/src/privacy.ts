// Routeur des droits RGPD (à monter DERRIÈRE l'authentification : ces actions concernent
// l'utilisateur connecté). Par défaut on lit req.user.id (posé par requireAuth de la brique 'auth') ;
// getUserId est injectable pour les tests. ZÉRO dépendance.
import { Router, type Request, type Response } from "express";
import type { PrivacyRegistry } from "./registry.js";
import type { ConsentStore } from "./consent.js";

export interface PrivacyRouterOptions {
  registry: PrivacyRegistry;
  consents: ConsentStore;
  /** finalités autorisées pour le consentement (ex. ["marketing","analytics"]) */
  purposes?: string[];
  /** version courante de la politique de confidentialité */
  consentVersion?: string;
  getUserId?: (req: Request) => string | undefined;
  now?: () => number;
}

export function createPrivacyRouter(opts: PrivacyRouterOptions): Router {
  const router = Router();
  const getUserId = opts.getUserId ?? ((req: Request) => (req as { user?: { id?: string } }).user?.id);
  const now = opts.now ?? (() => Date.now());
  const purposes = opts.purposes;
  const version = opts.consentVersion ?? "1.0";

  const requireUser = (req: Request, res: Response): string | null => {
    const uid = getUserId(req);
    if (!uid) {
      res.status(401).json({ error: "authentification requise" });
      return null;
    }
    return uid;
  };

  // Droit d'accès / portabilité.
  router.get("/export", async (req, res) => {
    const uid = requireUser(req, res);
    if (!uid) return;
    const data = await opts.registry.exportUserData(uid);
    const consents = await opts.consents.list(uid);
    return res.json({ exportedAt: now(), userId: uid, data, consents });
  });

  // Lister ses consentements.
  router.get("/consent", async (req, res) => {
    const uid = requireUser(req, res);
    if (!uid) return;
    return res.json({ consents: await opts.consents.list(uid) });
  });

  // Donner / retirer un consentement.
  router.post("/consent", async (req, res) => {
    const uid = requireUser(req, res);
    if (!uid) return;
    const { purpose, granted } = (req.body ?? {}) as { purpose?: string; granted?: boolean };
    if (typeof purpose !== "string" || !purpose) return res.status(400).json({ error: "purpose requis" });
    if (purposes && !purposes.includes(purpose)) return res.status(400).json({ error: "finalité inconnue" });
    if (granted === false) {
      await opts.consents.withdraw(uid, purpose);
      return res.json({ purpose, granted: false });
    }
    const rec = await opts.consents.grant(uid, purpose, version, now());
    return res.json({ purpose, granted: true, version: rec.version, grantedAt: rec.grantedAt });
  });

  // Droit à l'oubli : efface toutes les données + les consentements.
  router.delete("/me", async (req, res) => {
    const uid = requireUser(req, res);
    if (!uid) return;
    const erased = await opts.registry.eraseUserData(uid);
    const consentsErased = await opts.consents.eraseUser(uid);
    return res.json({ erased: { ...erased, consents: consentsErased } });
  });

  return router;
}
