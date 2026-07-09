// Outil PARCOURS de l'Élève agentique (#155) — teste_parcours.
//
// Donne à GLM le réflexe de JOUER son app et de vérifier que le flux marche
// (check_build dit que ça compile ; teste_parcours dit que ça MARCHE). Démarre/
// réutilise l'aperçu Vite (pool de preview.ts), joue le parcours sur UNE page
// persistante (eleve-parcours.ts), renvoie un rapport texte ✓/✗. isError si le
// parcours échoue → la boucle agentique de GLM se corrige toute seule.
//
// Réutilise : startPreview (preview.ts), runParcours (eleve-parcours.ts). Budget
// par tâche (ELEVE_PARCOURS_BUDGET, défaut 4). Ne lève jamais.

import { z } from "zod";
import type { KernelTool, KernelToolResult } from "../kernel/kernel-mcp.js";
import { startPreview } from "../preview.js";
import { runParcours, formatParcoursReport, type ParcoursEtape, type ParcoursReport } from "../eleve-parcours.js";

/** Budget de parcours par tâche (borne le coût navigateur). Lu à l'appel. */
function parcoursBudget(): number {
  const n = Number(process.env.ELEVE_PARCOURS_BUDGET);
  return Number.isFinite(n) && n > 0 ? n : 4;
}

/** Dépendances injectables (tests sans navigateur ni Vite). */
export interface ParcoursToolDeps {
  startPreview: (projectDir: string) => Promise<{ url: string }>;
  runParcours: (url: string, etapes: ParcoursEtape[]) => Promise<ParcoursReport>;
}

const realDeps: ParcoursToolDeps = {
  startPreview,
  runParcours: (url, etapes) => runParcours(url, etapes),
};

// Schéma Zod d'une étape (borné). Tableau d'étapes, chacune avec des actions
// optionnelles et un bloc « attendu » de vérifs déterministes.
const actionSchema = z.object({
  clickText: z.string().optional().describe("Cliquer le premier élément contenant ce texte (ex. 'Entraînement', 'Commencer')"),
  clickSelector: z.string().optional().describe("Cliquer un élément par sélecteur CSS"),
  fill: z.object({ selector: z.string(), text: z.string() }).optional().describe("Remplir un champ (sélecteur CSS) avec un texte"),
  key: z.string().optional().describe("Presser une touche clavier (ex. 'Enter', 'ArrowRight')"),
  wait: z.number().optional().describe("Attendre N millisecondes (plafonné à 3000)"),
});

const attenduSchema = z.object({
  texte: z.string().optional().describe("Un texte qui DOIT être visible après les actions (ex. 'Question 1')"),
  selecteur: z.string().optional().describe("Un élément CSS qui DOIT être visible"),
  image_chargee: z.boolean().optional().describe("true → vérifie qu'au moins une <img> est réellement chargée (anti image cassée)"),
  aucune_erreur_console: z.boolean().optional().describe("true → vérifie qu'aucune erreur JS/console n'est survenue pendant l'étape"),
});

const etapeSchema = z.object({
  description: z.string().describe("Décris l'étape en clair (ex. 'Aller dans Entraînement et ouvrir la Partie 1')"),
  actions: z.array(actionSchema).optional().describe("Actions à jouer dans l'ordre (clics, saisies, touches, attentes)"),
  attendu: attenduSchema.optional().describe("Ce qui doit être vrai APRÈS les actions (vérifs déterministes)"),
});

/** Construit l'outil teste_parcours. Renvoyé en tableau pour s'enregistrer. */
export function buildEleveParcoursTools(projectDir: string, deps: ParcoursToolDeps = realDeps): KernelTool[] {
  let used = 0;

  const tool: KernelTool = {
    name: "teste_parcours",
    description:
      "JOUE un vrai parcours utilisateur sur l'aperçu live de l'app (clics, saisies, touches) et VÉRIFIE le résultat " +
      "(un texte/élément apparaît, une image est bien chargée, aucune erreur console). À utiliser APRÈS avoir construit " +
      "ou modifié un FLUX (navigation, formulaire, quiz, liste, écran à écran) : check_build dit que ça COMPILE, " +
      "teste_parcours dit que ça MARCHE pour l'utilisateur. Donne une liste d'`etapes` ; chaque étape a des `actions` " +
      "et un `attendu`. Si le parcours échoue, lis les ✗ et CORRIGE, puis re-teste.",
    inputSchema: {
      etapes: z.array(etapeSchema).min(1).describe("Les étapes du parcours à jouer, dans l'ordre (max 20)"),
    },
    handler: async (args): Promise<KernelToolResult> => {
      const budget = parcoursBudget();
      if (used >= budget) {
        return {
          text: `Budget parcours épuisé (${budget} essais par tâche). Applique ce que tu as déjà appris des rapports et termine.`,
          isError: true,
        };
      }
      const etapes = (args.etapes ?? []) as ParcoursEtape[];
      if (!Array.isArray(etapes) || etapes.length === 0) {
        return { text: "Donne au moins une étape (`etapes`) à jouer.", isError: true };
      }
      used += 1;

      // 1. Aperçu live (démarre/réutilise le serveur Vite via le pool).
      let url: string;
      try {
        ({ url } = await deps.startPreview(projectDir));
      } catch (e) {
        return {
          text: `Aperçu indisponible (${(e as Error).message}) — impossible de jouer le parcours. Vérifie que le projet build, puis réessaie.`,
          isError: true,
        };
      }

      // 2. Jouer le parcours (ne lève jamais → rapport déterministe).
      const report = await deps.runParcours(url, etapes);
      const text = formatParcoursReport(report);

      // Échec → isError pour que la boucle de GLM se corrige.
      return report.ok
        ? { text: `${text}\n\n→ Le parcours marche. Tu peux finaliser.` }
        : { text: `${text}\n\n→ Corrige les ✗ ci-dessus (edit_file), puis rappelle teste_parcours pour re-vérifier.`, isError: true };
    },
  };

  return [tool];
}
