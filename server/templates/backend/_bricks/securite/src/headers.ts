// En-têtes de sécurité HTTP — équivalent minimal de helmet, ZÉRO dépendance.
// Pour une politique plus riche/maintenue : `npm i helmet` et remplacer securityHeaders par helmet().
import type { Request, Response, NextFunction } from "express";

export interface HeaderOptions {
  /** Content-Security-Policy (défaut strict 'self'). */
  csp?: string;
  /** Strict-Transport-Security (désactiver en dev HTTP avec hsts:false). */
  hsts?: boolean;
}

export function securityHeaders(opts: HeaderOptions = {}) {
  const csp = opts.csp ?? "default-src 'self'";
  return (_req: Request, res: Response, next: NextFunction) => {
    res.setHeader("Content-Security-Policy", csp);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
    if (opts.hsts !== false) {
      res.setHeader("Strict-Transport-Security", "max-age=15552000; includeSubDomains");
    }
    res.removeHeader("X-Powered-By");
    next();
  };
}
