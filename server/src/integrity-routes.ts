// Routes du vérificateur d'intégrité (#196 fault-finding, Partie 1, 2026-07-23).
import type { Express } from "express";
import { auditOnce } from "./integrity-audit.js";
import { readAuditLog } from "./integrity-log.js";

export function registerIntegrityRoutes(app: Express): void {
  // Déclenche un audit MAINTENANT (normalement inutile — tourne déjà en tâche de
  // fond, voir startIntegrityScheduler) — utile pour vérifier/déboguer manuellement.
  app.post("/api/integrity/audit", (_req, res) => {
    const findings = auditOnce();
    res.json({ findings });
  });

  // Journal complet des pertes détectées (validation OU disparition entre snapshots),
  // le plus récent en dernier. Best-effort, jamais un throw.
  app.get("/api/integrity/log", (_req, res) => {
    res.json({ entries: readAuditLog() });
  });
}

const INTEGRITY_INTERVAL_MS = Number(process.env.INTEGRITY_AUDIT_INTERVAL_MS ?? 60 * 60 * 1000); // 1h par défaut

/** Démarre le rythme périodique. Premier passage retardé (le temps que le boot du
 *  process se stabilise) — ne bloque jamais le démarrage du serveur, jamais un throw. */
export function startIntegrityScheduler(): void {
  if (process.env.INTEGRITY_AUDIT === "off") return;
  setTimeout(() => {
    try {
      auditOnce();
    } catch {
      /* best-effort — un audit raté ne doit jamais casser le process */
    }
    setInterval(() => {
      try {
        auditOnce();
      } catch {
        /* best-effort */
      }
    }, INTEGRITY_INTERVAL_MS).unref();
  }, 30_000).unref();
}
