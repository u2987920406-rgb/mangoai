// Validation aux FRONTIÈRES — middleware qui rejette tôt une entrée invalide (400).
// Compatible Zod (`safeParse`) : `validate(z.object({...}))` marche tel quel.
// Des mini-schémas ZÉRO dépendance sont fournis ci-dessous pour démarrer sans installer Zod ;
// pour des schémas riches, `npm i zod` et passer un schéma Zod (même API safeParse).
import type { Request, Response, NextFunction } from "express";

export type ParseResult<T> =
  | { success: true; data: T }
  | { success: false; errors?: string[]; error?: { issues?: { path: (string | number)[]; message: string }[] } };

export interface Schema<T = unknown> {
  safeParse(data: unknown): ParseResult<T>;
}

function toErrors(r: ParseResult<unknown>): string[] {
  if ("errors" in r && r.errors) return r.errors;
  if ("error" in r && r.error?.issues) return r.error.issues.map((i) => `${i.path.join(".") || "(racine)"}: ${i.message}`);
  return ["entrée invalide"];
}

export function validate(schema: Schema, where: "body" | "query" | "params" = "body") {
  return (req: Request, res: Response, next: NextFunction) => {
    const r = schema.safeParse((req as unknown as Record<string, unknown>)[where]);
    if (r.success) {
      (req as unknown as Record<string, unknown>)[where] = r.data;
      return next();
    }
    return res.status(400).json({ error: "validation", details: toErrors(r) });
  };
}

// ---- Mini-schémas zéro-dépendance (drop-in Zod via safeParse) ------------------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function string(opts: { min?: number; max?: number; email?: boolean } = {}): Schema<string> {
  return {
    safeParse(data) {
      if (typeof data !== "string") return { success: false, errors: ["doit être une chaîne"] };
      if (opts.min !== undefined && data.length < opts.min) return { success: false, errors: [`min ${opts.min} caractères`] };
      if (opts.max !== undefined && data.length > opts.max) return { success: false, errors: [`max ${opts.max} caractères`] };
      if (opts.email && !EMAIL_RE.test(data)) return { success: false, errors: ["email invalide"] };
      return { success: true, data };
    },
  };
}

export function object(shape: Record<string, Schema>): Schema<Record<string, unknown>> {
  return {
    safeParse(data) {
      if (!data || typeof data !== "object") return { success: false, errors: ["objet attendu"] };
      const src = data as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      const errors: string[] = [];
      for (const [key, sub] of Object.entries(shape)) {
        const r = sub.safeParse(src[key]);
        if (r.success) out[key] = r.data;
        else for (const e of toErrors(r)) errors.push(`${key}: ${e}`);
      }
      return errors.length ? { success: false, errors } : { success: true, data: out };
    },
  };
}
