// Vision d'un site EXTERNE pour l'Élève (2026-07-12) — comble le trou trouvé en
// creusant une question réelle de Raf : « décris-moi l'image sur la page de
// zara.com ». Constat : `vois_ecran` ne voit QUE l'aperçu live de MangoOS
// (localhost), `sharingan_url` extrait des tokens de DESIGN (palette/typo/CSS)
// mais ne décrit pas sémantiquement une image, et `sharingan_image` ne lit que
// des fichiers déjà LOCAUX (.assets/). Aucun outil ne reliait un site externe
// au cerveau vision pour une description de contenu — un vrai trou, pas une
// limite acceptée. Ce module ferme ce trou en réutilisant deux briques déjà
// éprouvées : `captureExternal`/`isCloneableUrl` (vision.ts, patron `clone_url`
// de Claude) pour le screenshot + `dispatch('vision', ...)` (patron `vois_ecran`)
// pour la lecture par le cerveau vision (VL, ex. qwen3-vl:8b).
import { z } from "zod";
import type { KernelTool, KernelToolResult } from "../kernel/kernel-mcp.js";
import { captureExternal, isCloneableUrl, MAX_IMAGE_BYTES } from "../vision.js";
import { dispatch } from "../brain.js";
import type { AgentResult } from "../agent/agent-contract.js";

function externalVisionBudget(): number {
  const n = Number(process.env.ELEVE_EXTERNAL_VISION_BUDGET);
  return Number.isFinite(n) && n > 0 ? n : 5;
}

/** Dépendances injectables (tests sans réseau ni navigateur). */
export interface ExternalVisionDeps {
  captureExternal: (url: string) => Promise<{ buf: Buffer; height: number }>;
  dispatch: (
    agentId: "vision",
    system: string,
    user: string,
    opts: { imageBase64?: string; trustExternal?: boolean; freeform?: boolean },
  ) => Promise<AgentResult>;
}

const realDeps: ExternalVisionDeps = { captureExternal, dispatch };

const EXTERNAL_VISION_SYSTEM =
  "Tu es l'œil de Mango — on te donne une CAPTURE D'ÉCRAN d'un site web PUBLIC. Décris ce que tu vois de façon " +
  "concrète et fidèle à la demande : contenu visuel réel (personnes, objets, couleurs, texte visible, mise en page), " +
  "pas une supposition sur ce que le site POURRAIT contenir. Si l'objectif demande de décrire une image précise et " +
  "que plusieurs images sont visibles, décris la plus proéminente/pertinente et précise-le. Sois concret et bref. " +
  "Réponds en français.";

/** Construit l'outil `regarde_site_web`. Renvoyé en tableau pour s'enregistrer
 *  dans le registre de l'Élève. Budget par INSTANCE (= par tâche), comme vois_ecran. */
export function buildEleveExternalVisionTools(deps: ExternalVisionDeps = realDeps): KernelTool[] {
  let used = 0;

  const tool: KernelTool = {
    name: "regarde_site_web",
    description:
      "Capture une VRAIE capture d'écran d'un site web PUBLIC (url http(s), pas localhost) et fait décrire son " +
      "contenu visuel par le cerveau vision — utile quand on te demande de décrire une image, une photo ou le " +
      "rendu visuel d'une page externe (ex. « décris l'image sur zara.com »). Différent de `sharingan_url` " +
      "(qui extrait des tokens de DESIGN — palette/typo — pas une description de contenu) et de `vois_ecran` " +
      "(qui ne voit QUE l'aperçu de CETTE app, jamais un site externe). Donne dans `objectif` ce que tu veux voir " +
      "décrit précisément.",
    inputSchema: {
      url: z.string().describe("URL publique http(s) du site à regarder (ex. https://www.zara.com/fr/)"),
      objectif: z
        .string()
        .describe("Ce que tu veux voir décrit (ex. « décris l'image principale de la page »)"),
    },
    handler: async (args): Promise<KernelToolResult> => {
      const budget = externalVisionBudget();
      if (used >= budget) {
        return {
          text: `Budget de vision externe épuisé (${budget} regards par tâche). N'en demande plus pour cette tâche.`,
          isError: true,
        };
      }
      const url = String(args.url ?? "").trim();
      const objectif = String(args.objectif ?? "").trim();
      if (!objectif) {
        return { text: "Précise l'`objectif` de ce que tu veux voir décrit.", isError: true };
      }
      if (!isCloneableUrl(url)) {
        return { text: "URL invalide — donne une adresse http(s) publique (pas localhost/IP privée).", isError: true };
      }
      used += 1;

      let imageBase64: string;
      try {
        const { buf } = await deps.captureExternal(url);
        if (buf.length > MAX_IMAGE_BYTES) {
          return { text: `Capture trop lourde (${Math.round(buf.length / 1024)} Ko) — réessaie.`, isError: true };
        }
        imageBase64 = buf.toString("base64");
      } catch (e) {
        return { text: `Capture impossible (${(e as Error).message}). Continue sans cette vision.`, isError: true };
      }

      const r = await deps.dispatch("vision", EXTERNAL_VISION_SYSTEM, objectif, {
        imageBase64,
        trustExternal: true,
        freeform: true,
      });
      if (r.status === "error" || r.status === "timeout" || !r.summary?.trim()) {
        return {
          text: `L'œil n'a pas pu lire cette page (${r.summary || r.status}). Continue sans cette vision.`,
          isError: true,
        };
      }

      return {
        text: `👁 Vision externe — ${url}, objectif « ${objectif} » :\n${r.summary.trim()}`,
      };
    },
  };

  return [tool];
}
