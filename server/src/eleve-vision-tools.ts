// Sharingan de l'Élève (#150-suite) — l'œil de GLM sur son propre rendu.
//
// GLM-5.2 code à l'aveugle (cause-racine des incohérences UI prouvée en réel) :
// il ne VOIT pas le rendu, un build vert ne dit rien de l'apparence. Cet outil
// lui donne un œil : il rend l'aperçu live de l'app → image → la fait LIRE par le
// cerveau `vision` (un VL via Brain-Dispatch #150, ex. qwen3.5:cloud) → renvoie une
// CRITIQUE TEXTE que GLM (non-multimodal) peut exploiter pour s'auto-corriger.
//
// Réutilise tout le tuyau déjà là : preview.ts (startPreview, pool LRU),
// vision.ts (capturePreview), brain-dispatch.ts (dispatch + mode freeform).
// Gaté par ELEVE_VISION=on (défaut OFF → zéro régression). Ne throw JAMAIS.
import { z } from "zod";
import type { KernelTool, KernelToolResult } from "./kernel-mcp.js";
import { startPreview } from "./preview.js";
import { capturePreview } from "./vision.js";
import { dispatch } from "./brain-dispatch.js";
import type { AgentResult } from "./agent-contract.js";

/** Nombre max de « regards » par tâche (borne le coût et l'abus). Lu à l'appel. */
function visionBudget(): number {
  const n = Number(process.env.ELEVE_VISION_BUDGET);
  return Number.isFinite(n) && n > 0 ? n : 5;
}

/** Dépendances injectables (tests sans réseau ni navigateur). */
export interface VisionDeps {
  startPreview: (projectDir: string) => Promise<{ url: string }>;
  capturePreview: (url: string, opts?: { fullPage?: boolean }) => Promise<Buffer>;
  dispatch: (
    agentId: "vision",
    system: string,
    user: string,
    opts: { imageBase64?: string; trustExternal?: boolean; freeform?: boolean },
  ) => Promise<AgentResult>;
}

const realDeps: VisionDeps = { startPreview, capturePreview, dispatch };

// Encode les axiomes VISION-01 (juger une UI exige de VOIR) + UIUX-11 (une charte
// couvre TOUT le flux, pas la devanture). Le VL répond en PROSE (mode freeform).
const VISION_SYSTEM =
  "Tu es l'œil de Mango — un expert design/UI/UX. On te donne une CAPTURE du rendu réel d'une app web " +
  "(pas son code). Réponds à l'objectif demandé. Vérifie systématiquement : cohérence de la charte " +
  "(couleurs, typographie, espacements HOMOGÈNES sur tout l'écran — pas seulement la devanture), " +
  "lisibilité et contraste du texte, alignement et mise en page, et tout élément resté dans un thème " +
  "incohérent (ex. zone sombre dans une app claire). Sois CONCRET et BREF : liste les écarts visuels " +
  "précis et où ils se trouvent ; si tout est cohérent, dis-le clairement. Réponds en français.";

/** Construit l'outil `vois_ecran`. Renvoyé en tableau pour s'enregistrer dans le
 *  registre d'action de l'Élève. Le budget est par INSTANCE (= par tâche). */
export function buildEleveVisionTools(projectDir: string, deps: VisionDeps = realDeps): KernelTool[] {
  let used = 0;

  const tool: KernelTool = {
    name: "vois_ecran",
    description:
      "Regarde le RENDU réel de l'app (capture l'aperçu live) et reçois une critique visuelle. " +
      "Utilise-le APRÈS un travail d'UI pour vérifier toi-même la cohérence de charte (couleurs/typo/" +
      "espacements), la lisibilité et le layout sur l'écran — un build vert ne prouve PAS l'apparence. " +
      "Donne dans `objectif` ce que tu veux faire vérifier (ex. « la page d'accueil est-elle cohérente " +
      "et lisible ? »). `chemin` (optionnel) te permet de regarder une AUTRE page que l'accueil " +
      "(ex. '/contact', '/jeu') — vérifie CHAQUE page importante, pas seulement la devanture. " +
      "`page_entiere: true` capture toute la hauteur (sections basses + footer inclus). " +
      "Corrige ensuite les écarts signalés, puis re-vérifie si besoin.",
    inputSchema: {
      objectif: z
        .string()
        .describe("Ce que tu veux faire vérifier visuellement (ex. « cohérence des couleurs sur l'accueil »)"),
      chemin: z
        .string()
        .optional()
        .describe("Route à visiter avant la capture (ex. '/contact'). Défaut : la page d'accueil."),
      page_entiere: z
        .boolean()
        .optional()
        .describe("true = capturer TOUTE la hauteur de la page (pas seulement l'écran visible)."),
    },
    handler: async (args): Promise<KernelToolResult> => {
      const budget = visionBudget();
      if (used >= budget) {
        return {
          text: `Budget vision épuisé (${budget} regards par tâche). N'en demande plus : applique ce que tu as déjà vu et termine la tâche.`,
          isError: true,
        };
      }
      const objectif = String(args.objectif ?? "").trim();
      if (!objectif) {
        return { text: "Précise l'`objectif` de la vérification visuelle.", isError: true };
      }
      used += 1;

      // 1. Aperçu live (démarre/réutilise un serveur Vite via le pool).
      let url: string;
      try {
        ({ url } = await deps.startPreview(projectDir));
      } catch (e) {
        return {
          text: `Aperçu indisponible (${(e as Error).message}) — impossible de voir l'écran. Continue sans la vision et termine.`,
          isError: true,
        };
      }

      // 2. Capture du rendu — route interne optionnelle (multi-pages) + pleine hauteur.
      const chemin = String(args.chemin ?? "").trim();
      const fullPage = args.page_entiere === true;
      let target = url;
      if (chemin) {
        try {
          target = new URL(chemin, url).toString();
        } catch {
          return { text: `Chemin invalide (« ${chemin} ») — donne une route relative comme '/contact'.`, isError: true };
        }
      }
      let imageBase64: string;
      try {
        const buf = await deps.capturePreview(target, { fullPage });
        imageBase64 = buf.toString("base64");
      } catch (e) {
        return { text: `Capture impossible (${(e as Error).message}). Continue sans la vision.`, isError: true };
      }

      // 3. Lecture par le cerveau vision (VL), en PROSE (freeform).
      const r = await deps.dispatch("vision", VISION_SYSTEM, objectif, {
        imageBase64,
        trustExternal: true,
        freeform: true,
      });
      if (r.status === "error" || r.status === "timeout" || !r.summary?.trim()) {
        return {
          text: `L'œil n'a pas pu lire l'écran (${r.summary || r.status}). Continue sans la vision pour cette fois.`,
          isError: true,
        };
      }

      return {
        text:
          `👁 Vision — objectif « ${objectif} »${chemin ? ` (page ${chemin})` : ""}${fullPage ? " (pleine hauteur)" : ""} :\n${r.summary.trim()}\n\n` +
          "→ Corrige les écarts visuels signalés (edit_file), puis re-vérifie si nécessaire avant finish.",
      };
    },
  };

  return [tool];
}
