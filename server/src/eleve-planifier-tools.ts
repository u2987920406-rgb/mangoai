// Outil PLANIFIER de l'Élève agentique (#160) — « planifier avant d'agir ».
//
// Donne à l'Élève le réflexe de Claude : AVANT de coder une tâche non triviale,
// poser un PLAN d'étapes ordonnées. Le plan est mémorisé (eleve-plan.ts, store
// éphémère par projet) et sert de fil conducteur — il est rappelé à l'Élève quand
// il dérive (nudge d'auto-relance, eleve.ts). Clause ⚠ PLANIFIE D'ABORD dans
// AGENTIC_TOOL_CONTRACT. Deps injectables (tests). Ne lève jamais.

import { z } from "zod";
import type { KernelTool, KernelToolResult } from "./kernel-mcp.js";
import { setPlan, markStepDone, formatPlan, type ElevePlan, type PlanEtape } from "./eleve-plan.js";

const MIN_ETAPES = 2; // un « plan » d'une seule étape n'est pas un plan
const MAX_ETAPES = 12; // au-delà, c'est du sur-découpage

/** Dépendances injectables (tests sans store réel). */
export interface PlanifierDeps {
  setPlan: (projectDir: string, plan: ElevePlan) => void;
  markStepDone: (projectDir: string, n: number) => ElevePlan | undefined;
  now: () => number;
}

const realDeps: PlanifierDeps = { setPlan, markStepDone, now: () => Date.now() };

export function buildElevePlanifierTools(projectDir: string, deps: PlanifierDeps = realDeps): KernelTool[] {
  const planifier: KernelTool = {
    name: "planifier",
    description:
      "Pose un PLAN d'étapes ordonnées AVANT de coder une tâche non triviale. Donne un `titre` (ce que tu " +
      "dois construire) et `etapes` (2 à 12, dans l'ordre, chacune un `titre` court + un `detail` optionnel). " +
      "Le plan te sert de fil conducteur : exécute-le étape par étape (check_build aux jalons), n'oublie aucune " +
      "étape. Re-planifie si la tâche change. Inutile pour un changement trivial (1 fichier).",
    inputSchema: {
      titre: z.string().describe("Ce que tu dois construire/réaliser (ex. « Page Contact avec formulaire validé »)"),
      etapes: z
        .array(
          z.object({
            titre: z.string().describe("Étape courte (ex. « Créer le composant formulaire »)"),
            detail: z.string().optional().describe("Détail optionnel : comment, pourquoi, risque connu"),
          }),
        )
        .min(MIN_ETAPES)
        .max(MAX_ETAPES)
        .describe(`Les étapes du plan, dans l'ordre (${MIN_ETAPES} à ${MAX_ETAPES}).`),
    },
    handler: (args): KernelToolResult => {
      const titre = String(args.titre ?? "").trim();
      if (!titre) {
        return { text: "Donne un `titre` au plan (ce que tu dois construire).", isError: true };
      }
      const raw = Array.isArray(args.etapes) ? (args.etapes as Array<{ titre?: unknown; detail?: unknown }>) : [];
      const etapes: PlanEtape[] = raw
        .map((e, i) => ({
          n: i + 1,
          titre: String(e?.titre ?? "").trim(),
          detail: typeof e?.detail === "string" && e.detail.trim() ? e.detail.trim() : undefined,
        }))
        .filter((e) => e.titre);
      // renumérote après filtrage des étapes vides
      etapes.forEach((e, i) => (e.n = i + 1));

      if (etapes.length < MIN_ETAPES) {
        return {
          text: `Un plan a au moins ${MIN_ETAPES} étapes ordonnées (chacune avec un titre). Découpe la tâche en étapes concrètes.`,
          isError: true,
        };
      }

      try {
        const plan: ElevePlan = { titre, etapes, at: deps.now(), done: [] };
        deps.setPlan(projectDir, plan);
        return { text: formatPlan(plan) };
      } catch (e) {
        return { text: `Plan non enregistré : ${e instanceof Error ? e.message : String(e)}`, isError: true };
      }
    },
  };

  // L18 — suivi de progression : l'Élève COCHE chaque étape terminée → il voit ce
  // qu'il reste à faire (et le rappel d'auto-relance affiche sa progression).
  const etapeFaite: KernelTool = {
    name: "etape_faite",
    description:
      "Coche une étape de ton plan comme FAITE. Donne `n` = le numéro de l'étape terminée (et vérifiée au " +
      "build). Appelle cet outil dès qu'une étape est bouclée pour suivre ta progression : il renvoie la " +
      "checklist à jour avec la prochaine étape à faire. N'appelle finish que quand toutes les étapes sont cochées.",
    inputSchema: {
      n: z.number().int().min(1).describe("Numéro de l'étape que tu viens de terminer"),
    },
    handler: (args): KernelToolResult => {
      const n = Math.trunc(Number(args.n));
      if (!Number.isFinite(n) || n < 1) {
        return { text: "Donne le numéro `n` de l'étape terminée (entier ≥ 1).", isError: true };
      }
      try {
        const plan = deps.markStepDone(projectDir, n);
        if (!plan) {
          return { text: "Aucun plan en cours — appelle d'abord planifier pour poser tes étapes.", isError: true };
        }
        return { text: formatPlan(plan) };
      } catch (e) {
        return { text: `Étape non cochée : ${e instanceof Error ? e.message : String(e)}`, isError: true };
      }
    },
  };

  return [planifier, etapeFaite];
}
