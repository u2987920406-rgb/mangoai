// Lecture d'images par l'Élève (#151-suite) — l'œil de GLM sur un fichier image.
//
// GLM-5.2 est non-multimodal : il ne peut pas VOIR une image. Mais l'utilisateur
// peut joindre des captures (.assets/maquette.png), et l'Élève a besoin de les
// LIRE pour reproduire un design, extraire une palette, comprendre un wireframe.
// Cet outil comble ce manque : il lit le fichier image → l'envoie au cerveau
// `vision` (un VL via Brain-Dispatch #150) → renvoie une DESCRIPTION TEXTE que
// GLM (non-multimodal) peut exploiter.
//
// Réutilise le tuyau brain-dispatch (dispatch + mode freeform), comme vois_ecran
// mais au lieu de capturer l'aperçu live, on lit une image depuis le disque.
// Gaté par ELEVE_VISION=on (même gate que vois_ecran). Ne throw JAMAIS.

import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { KernelTool, KernelToolResult } from "../kernel/kernel-mcp.js";
import { confinePath } from "../perimeter-context.js";

/** Extensions image acceptées (alignées sur uploads.ts). */
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);
/** Cap embarqué — même plafond que vision.ts (4 Mo, limite Anthropic). */
const MAX_IMAGE_BYTES = 4_000_000;

/** Résultat minimal du dispatch (sous-ensemble d'AgentResult — évite l'import
 *  statique de brain-dispatch → brain-registry qui utilise import.meta.dirname,
 *  indisponible en CJS sandbox). */
interface DispatchResult {
  status: "ok" | "partial" | "error" | "timeout";
  summary: string;
}

/** Dépendances injectables (tests sans réseau ni navigateur). */
export interface ImageDeps {
  dispatch: (
    agentId: "vision",
    system: string,
    user: string,
    opts: { imageBase64?: string; trustExternal?: boolean; freeform?: boolean },
  ) => Promise<DispatchResult>;
}

// Import lazy : brain-dispatch (→ brain-registry → import.meta.dirname) n'est
// chargé qu'au premier appel réel. Les tests mockent dispatch, donc le tuyau
// n'est jamais déclenché en sandbox.
const realDeps: ImageDeps = {
  dispatch: async (agentId, system, user, opts) => {
    const { dispatch } = await import("../brain/brain-dispatch.js");
    return dispatch(agentId, system, user, opts);
  },
};

// Le VL répond en PROSE (mode freeform) — même stance que vois_ecran.
const IMAGE_SYSTEM =
  "Tu es l'œil de Mango — un expert design/UI/UX. On te donne une IMAGE (capture, maquette, " +
  "wireframe, photo de référence). Réponds à l'objectif demandé. Décris ce que tu vois : " +
  "structure, layout, couleurs dominantes (donne les codes hex), typographie, espacements, " +
  "composants visibles, ambiance générale. Sois CONCRET et BREF. Réponds en français.";

/** Construit l'outil `lire_image`. Renvoyé en tableau pour s'enregistrer dans le
 *  registre d'action de l'Élève. */
export function buildEleveImageTools(projectDir: string, deps: ImageDeps = realDeps): KernelTool[] {
  const tool: KernelTool = {
    name: "lire_image",
    description:
      "LIT une image du projet (PNG/JPEG/WebP/GIF — ex. .assets/maquette.png) et reçois sa " +
      "description visuelle : structure, couleurs (hex), typographie, layout, ambiance. " +
      "Utilise-le quand l'utilisateur a joint une capture/maquette/photo de référence et que " +
      "tu dois la REPRODUIRE ou t'en inspirer. Donne dans `objectif` ce que tu veux en extraire " +
      "(ex. « reproduire ce layout », « extraire la palette »).",
    inputSchema: {
      path: z.string().describe("Chemin relatif au projet de l'image, ex. .assets/maquette.png"),
      objectif: z
        .string()
        .optional()
        .describe("Ce que tu veux extraire de l'image (défaut : description générale)"),
    },
    handler: async (args): Promise<KernelToolResult> => {
      const rel = String(args.path ?? "").trim();
      if (!rel) {
        return { text: "Précise le `path` de l'image (ex. .assets/maquette.png).", isError: true };
      }

      // Confinement au projet (#180 É2 : lecture d'image → accès `read`).
      // Gate OFF = byte-identique (même message « chemin hors du projet »).
      let abs: string;
      try {
        abs = confinePath(projectDir, rel, "read");
      } catch (e) {
        return { text: (e as Error).message, isError: true };
      }

      const ext = path.extname(abs).toLowerCase();
      if (!IMAGE_EXTENSIONS.has(ext)) {
        return {
          text: `Format non supporté « ${ext || "?"} » — utilise PNG, JPEG, WebP ou GIF.`,
          isError: true,
        };
      }

      if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
        return { text: `image introuvable : ${rel}`, isError: true };
      }

      let buf: Buffer;
      try {
        buf = fs.readFileSync(abs);
      } catch {
        return { text: `illisible : ${rel}`, isError: true };
      }
      if (buf.length === 0) {
        return { text: `image vide : ${rel}`, isError: true };
      }
      if (buf.length > MAX_IMAGE_BYTES) {
        return {
          text: `image trop lourde (${(buf.length / 1_000_000).toFixed(1)} Mo — max 4 Mo).`,
          isError: true,
        };
      }

      const imageBase64 = buf.toString("base64");
      const objectif =
        String(args.objectif ?? "").trim() ||
        "Décris cette image : structure, couleurs, typographie, layout, ambiance.";

      // Lecture par le cerveau vision (VL), en PROSE (freeform).
      const r = await deps.dispatch("vision", IMAGE_SYSTEM, objectif, {
        imageBase64,
        trustExternal: true,
        freeform: true,
      });
      if (r.status === "error" || r.status === "timeout" || !r.summary?.trim()) {
        return {
          text: `L'œil n'a pas pu lire l'image (${r.summary || r.status}).`,
          isError: true,
        };
      }

      return {
        text: `👁 Lecture de « ${rel} » — objectif « ${objectif} » :\n${r.summary.trim()}`,
      };
    },
  };

  return [tool];
}
