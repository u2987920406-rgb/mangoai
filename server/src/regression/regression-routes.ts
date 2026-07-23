// Routes du tableau de bord fault-finding (#196 Partie 5) — expose le catalogue
// de régression (statique, dans le binaire) et le dernier rapport de chaos (sur
// disque, écrit par chaos-runner.ts). Lecture seule : rien ici ne DÉCLENCHE de
// sonde — la sonde de chaos touche de vrais process et ne doit jamais partir
// d'une requête HTTP non supervisée (cf. chaos-runner.ts, à lancer manuellement
// ou via un scheduler opt-in explicite, jamais depuis une route).
import type { Express } from "express";
import fs from "node:fs";
import path from "node:path";
import { dataDir } from "../safe-io.js";
import { REGRESSION_CATALOG, catalogSummary } from "./regression-catalog.js";

function reportPath(): string {
  return process.env.REGRESSION_REPORT_FILE ?? dataDir("regression-report.json");
}

export function readLastChaosReport(): unknown | null {
  try {
    return JSON.parse(fs.readFileSync(reportPath(), "utf8"));
  } catch {
    return null;
  }
}

export function registerRegressionRoutes(app: Express): void {
  app.get("/api/regression/catalog", (_req, res) => {
    res.json({ summary: catalogSummary(), entries: REGRESSION_CATALOG });
  });

  app.get("/api/regression/chaos-report", (_req, res) => {
    const report = readLastChaosReport();
    if (!report) {
      res.status(404).json({ error: "Aucune sonde de chaos n'a encore tourné (npx tsx src/regression/chaos-runner.ts)." });
      return;
    }
    res.json(report);
  });
}
