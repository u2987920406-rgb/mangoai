// Outil « assemble_brique » de l'Élève (#169, dernière pièce) — gaté ELEVE_BRICKS=on.
// Permet à Mango de COMPOSER son infra back lui-même à partir des briques éprouvées de
// templates/backend/_bricks/ (auth · db · paiement · securite · RGPD) : sans argument il liste
// le CATALOGUE ; avec `briques`, il copie les fichiers + fusionne package.json + rend les
// snippets de montage (résolution transitive des dépendances incluse). Écriture confinée au projet.
import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { KernelTool, KernelToolResult } from "../kernel/kernel-mcp.js";
import type { BricksIO } from "../backend-bricks.js";
import { assembleBricks, listAvailableBricks, type AssembleDeps } from "../eleve-bricks.js";
import { confinePath } from "../perimeter-context.js";

// Dossier des briques, relatif à ce fichier (server/src/ → server/templates/backend/_bricks).
const DEFAULT_BRICKS_DIR = fileURLToPath(new URL("../templates/backend/_bricks", import.meta.url));

// Empêche d'écrire hors du projet. (#180 É2) `access` distingue readProjectFile
// (lecture) de writeProjectFile (écriture). Gate OFF = byte-identique.
function resolveInside(root: string, rel: string, access: "read" | "write"): string {
  return confinePath(root, rel, access);
}

export interface BricksToolDeps {
  bricksDir: string;
  io: AssembleDeps;
}

function realDeps(projectDir: string): BricksToolDeps {
  const bricksDir = DEFAULT_BRICKS_DIR;
  const bricksIO: BricksIO = {
    readdir: (dir) => fs.promises.readdir(dir),
    readFile: (p) => fs.promises.readFile(p, "utf8"),
  };
  return {
    bricksDir,
    io: {
      bricksIO,
      readBrickFile: (rel) => fs.readFileSync(path.join(bricksDir, rel), "utf8"),
      readProjectFile: (rel) => {
        const abs = resolveInside(projectDir, rel, "read");
        return fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : null;
      },
      writeProjectFile: (rel, data) => {
        const abs = resolveInside(projectDir, rel, "write");
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, data);
      },
    },
  };
}

export function buildEleveBricksTools(projectDir: string, deps: BricksToolDeps = realDeps(projectDir)): KernelTool[] {
  const assembleBrique: KernelTool = {
    name: "assemble_brique",
    description:
      "COMPOSE ton infrastructure back-end à partir de briques d'infra ÉPROUVÉES (auth · db · paiement · securite · RGPD) au lieu de tout réécrire. Sans `briques`, renvoie le CATALOGUE (ce que chaque brique fournit/exige). Avec `briques` (ex. [\"auth\",\"db\"]), copie leurs fichiers dans src/, fusionne les dépendances dans package.json, ajoute automatiquement les briques requises (ex. RGPD tire auth), et te rend les SNIPPETS de montage à coller dans ton serveur. Idéal dès qu'une app a besoin de comptes, base de données, paiement Stripe, durcissement HTTP ou conformité RGPD.",
    inputSchema: {
      briques: z
        .array(z.string())
        .optional()
        .describe("Noms des briques à assembler (ex. [\"auth\",\"db\"]). Omettre pour lister le catalogue."),
    },
    handler: async (args): Promise<KernelToolResult> => {
      const briques = Array.isArray(args.briques) ? (args.briques as unknown[]).map(String).filter(Boolean) : [];

      // Sans sélection → catalogue.
      if (briques.length === 0) {
        try {
          const cat = await listAvailableBricks(deps.bricksDir, deps.io.bricksIO);
          if (!cat.length) return { text: "Aucune brique d'infra disponible.", isError: true };
          const lines = cat.map(
            (b) =>
              `• ${b.name} (${b.level}) — ${b.title}\n    fournit: ${b.provides.join(", ") || "—"}` +
              `${b.requires.length ? ` · requiert: ${b.requires.join(", ")}` : ""}` +
              `${b.env.length ? ` · env: ${b.env.join(", ")}` : ""}`,
          );
          return {
            text:
              `Briques d'infra back disponibles (${cat.length}) :\n${lines.join("\n")}\n\n` +
              `Pour en assembler : appelle assemble_brique avec briques:["auth","db",…].`,
          };
        } catch (e) {
          return { text: `Catalogue indisponible : ${e instanceof Error ? e.message : String(e)}`, isError: true };
        }
      }

      // Avec sélection → assemblage.
      const r = await assembleBricks(deps.bricksDir, briques, deps.io);
      if (!r.ok) {
        return { text: `Assemblage impossible :\n- ${r.errors.join("\n- ")}`, isError: true };
      }

      const auto = r.autoAdded.length ? ` (dont ajoutées automatiquement : ${r.autoAdded.join(", ")})` : "";
      const deps2 = Object.entries(r.depsAdded).map(([k, v]) => `${k}@${v}`).join(", ") || "—";
      const envLines = r.env.length
        ? r.env.map((e) => `    ${e.name}${e.required ? " (requis)" : ""}${e.description ? ` — ${e.description}` : ""}`).join("\n")
        : "    —";
      const mountLines = r.mounts
        .map((m) => `  [${m.brick}]\n  ${m.import.split("\n").join("\n  ")}\n  ${m.use.split("\n").join("\n  ")}`)
        .join("\n\n");

      return {
        text:
          `Infra assemblée : ${r.resolved.join(" → ")}${auto}.\n` +
          `${r.written.length} fichiers écrits (src/ + package.json).\n` +
          `Dépendances ajoutées : ${deps2} → lance \`npm install\`.\n` +
          `Variables d'environnement à poser dans .env :\n${envLines}\n\n` +
          `Montage à coller dans ton serveur (dans cet ordre) :\n${mountLines}`,
      };
    },
  };

  return [assembleBrique];
}
