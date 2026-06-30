// Router d'authentification + middleware de protection.
// Monté via : app.use('/api/auth', createAuthRouter({ secret }))
// Protège une route via : app.get('/x', requireAuth(secret), handler)
import { Router, type Request, type Response, type NextFunction } from "express";
import { getHasher } from "./password.js";
import { signToken, verifyToken } from "./tokens.js";
import { createMemoryUserStore, type UserStore } from "./store.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: { id: string };
    }
  }
}

export interface AuthOptions {
  secret: string;
  store?: UserStore;
  accessTtlSec?: number;
  refreshTtlSec?: number;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Hash factice valide : sert au repli anti-timing quand l'email n'existe pas.
const DUMMY_HASH = "scrypt$0000$0000";

function issueTokens(sub: string, email: string, secret: string, accessTtl: number, refreshTtl: number) {
  return {
    user: { id: sub, email },
    accessToken: signToken({ sub, type: "access", ttlSec: accessTtl }, secret),
    refreshToken: signToken({ sub, type: "refresh", ttlSec: refreshTtl }, secret),
  };
}

export function createAuthRouter(opts: AuthOptions): Router {
  const store = opts.store ?? createMemoryUserStore();
  const accessTtl = opts.accessTtlSec ?? Number(process.env.AUTH_ACCESS_TTL ?? 900);
  const refreshTtl = opts.refreshTtlSec ?? Number(process.env.AUTH_REFRESH_TTL ?? 1209600);
  const router = Router();

  router.post("/register", async (req, res) => {
    const { email, password } = req.body ?? {};
    if (typeof email !== "string" || !EMAIL_RE.test(email)) {
      return res.status(400).json({ error: "email invalide" });
    }
    if (typeof password !== "string" || password.length < 8) {
      return res.status(400).json({ error: "mot de passe trop court (min 8)" });
    }
    if (await store.findByEmail(email)) {
      return res.status(409).json({ error: "compte déjà existant" });
    }
    const hasher = await getHasher();
    const user = await store.create({ email, passwordHash: await hasher.hash(password) });
    return res.status(201).json(issueTokens(user.id, user.email, opts.secret, accessTtl, refreshTtl));
  });

  router.post("/login", async (req, res) => {
    const { email, password } = req.body ?? {};
    if (typeof email !== "string" || typeof password !== "string") {
      return res.status(400).json({ error: "identifiants requis" });
    }
    const user = await store.findByEmail(email);
    const hasher = await getHasher();
    // On exécute toujours un verify (anti-timing) même si l'email est inconnu.
    const ok = user
      ? await hasher.verify(password, user.passwordHash)
      : (await hasher.verify(password, DUMMY_HASH), false);
    if (!user || !ok) {
      return res.status(401).json({ error: "identifiants invalides" });
    }
    return res.json(issueTokens(user.id, user.email, opts.secret, accessTtl, refreshTtl));
  });

  router.post("/refresh", async (req, res) => {
    const { refreshToken } = req.body ?? {};
    if (typeof refreshToken !== "string") {
      return res.status(400).json({ error: "refreshToken requis" });
    }
    const v = verifyToken(refreshToken, opts.secret);
    if (!v.ok || v.claims.type !== "refresh") {
      return res.status(401).json({ error: "refresh token invalide" });
    }
    const user = await store.findById(v.claims.sub);
    if (!user) return res.status(401).json({ error: "utilisateur introuvable" });
    return res.json(issueTokens(user.id, user.email, opts.secret, accessTtl, refreshTtl));
  });

  return router;
}

export function requireAuth(secret: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
      return res.status(401).json({ error: "token manquant" });
    }
    const v = verifyToken(header.slice(7), secret);
    if (!v.ok || v.claims.type !== "access") {
      return res.status(401).json({ error: "token invalide" });
    }
    req.user = { id: v.claims.sub };
    next();
  };
}
