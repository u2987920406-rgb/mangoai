// CORS par ALLOWLIST — ZÉRO dépendance. Ne renvoie l'en-tête d'autorisation que pour une origine
// explicitement listée (ou '*'). Gère le préflight OPTIONS. Pour des besoins avancés : `npm i cors`.
import type { Request, Response, NextFunction } from "express";

export interface CorsOptions {
  origins: string[]; // liste blanche, ou ['*'] pour tout autoriser (déconseillé avec credentials)
  methods?: string[];
  headers?: string[];
  credentials?: boolean;
}

export function cors(opts: CorsOptions) {
  const methods = (opts.methods ?? ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]).join(", ");
  const headers = (opts.headers ?? ["Content-Type", "Authorization"]).join(", ");
  const allowAll = opts.origins.includes("*");

  return (req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin as string | undefined;
    if (origin && (allowAll || opts.origins.includes(origin))) {
      res.setHeader("Access-Control-Allow-Origin", allowAll ? "*" : origin);
      res.setHeader("Vary", "Origin");
      if (opts.credentials && !allowAll) res.setHeader("Access-Control-Allow-Credentials", "true");
    }
    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Methods", methods);
      res.setHeader("Access-Control-Allow-Headers", headers);
      return res.status(204).end();
    }
    next();
  };
}
