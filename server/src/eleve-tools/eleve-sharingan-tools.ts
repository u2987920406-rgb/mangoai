// Sharingan DIRECT pour l'Élève (#182 suite, 2026-07-11 — Raf : « câble Sharingan
// dans le pipeline MangoOS ET MangoQA »).
//
// Constat : Sharingan (sharinganAnalyze/analyzeImageFile, vision.ts) était déjà
// utilisé côté Élève, mais INDIRECTEMENT — noyé dans `extraire_site` (crawl +
// design + vision VL + persist Blackboard + images Pexels, budgété 3 appels/tâche).
// Côté Claude (agent.ts), l'agent a un accès DIRECT et léger via les tools MCP
// `sharingan_url`/`sharingan_image`. Ce module donne à l'Élève la MÊME granularité :
// un coup d'œil rapide, sans passer par tout le pipeline dossier.
//
// Contrainte structurelle : l'Élève n'est PAS multimodal (contrairement à Claude) —
// le retour est TEXTE SEUL (KernelToolResult = { text, isError? }), jamais d'image
// encodée dans la réponse (à la différence du tool MCP sharingan_image qui renvoie
// aussi l'image en base64 pour que Claude la "voie" nativement).
//
// Bonus : publie la palette extraite comme `design.reference` (source "sharingan")
// sur le Bus — réveille la mesure de conformité (briefDrift) dormante côté MangoQA
// (Œil Design, design-eye/eye.ts), qui ne recevait jusqu'ici que la palette
// Perfect Plan. Fire-and-forget, ne bloque jamais l'outil.
import path from "node:path";
import { z } from "zod";
import { type KernelTool, type KernelToolResult } from "../kernel/kernel-mcp.js";
import { sharinganAnalyze, analyzeImageFile, type SharinganResult } from "../vision.js";
import { publishDesignReference } from "../kernel/kernel-design-events.js";

export interface SharinganDeps {
  analyzeUrl: (url: string) => Promise<SharinganResult>;
  analyzeImage: (absPath: string) => Promise<{ palette: string[]; ambiance: string; samples: number }>;
  publishRef: typeof publishDesignReference;
}
const realDeps: SharinganDeps = { analyzeUrl: sharinganAnalyze, analyzeImage: analyzeImageFile, publishRef: publishDesignReference };

/** Résumé texte d'un SharinganResult pour un cerveau non-multimodal. */
export function formatSharinganUrlText(r: SharinganResult): string {
  const lines = [
    `# Sharingan — ${r.url}`,
    "",
    `## Titre`,
    r.structure.title || "(aucun)",
    "",
    `## Palette (${r.palette.length})`,
    r.palette.join(", ") || "(aucune couleur détectée)",
    "",
    `## Typographie`,
    r.fonts.length ? r.fonts.join(", ") : "(non détectée)",
    "",
    `## Structure (${r.structure.sections.length} section(s), ${r.structure.headings.length} titre(s))`,
    r.structure.navItems.length ? `Navigation : ${r.structure.navItems.join(" · ")}` : "",
    r.structure.headings.slice(0, 8).map((h) => `${"#".repeat(Math.min(6, h.level + 1))} ${h.text}`).join("\n"),
    r.structure.ctaTexts.length ? `\nAppels à l'action : ${r.structure.ctaTexts.join(" · ")}` : "",
  ];
  return lines.filter((l) => l !== "").join("\n");
}

/** Registre Sharingan direct — gate ELEVE_SHARINGAN (défaut ON, déterministe/$0,
 *  coupure ELEVE_SHARINGAN=off si besoin). `projectName` sert à publier la bonne
 *  cible design sur le Bus (nom du dossier projet = clé du Bus MangoQA). */
export function buildEleveSharinganTools(projectDir: string, deps: SharinganDeps = realDeps): KernelTool[] {
  const projectName = path.basename(projectDir);

  const tools: KernelTool[] = [
    {
      name: "sharingan_url",
      description:
        "Analyse en PROFONDEUR un site public en direct (URL http/https) : palette de couleurs réelle, typographie, structure (titres, nav, CTA), sans passer par tout le pipeline extraire_site. Utilise-le pour un coup d'œil RAPIDE sur un site de référence quand l'utilisateur dit « clone pixel-perfect », « copie exacte », ou pour ancrer une palette/typo sur un site réel avant de coder. Renvoie un résumé texte (pas d'image — décris ce que tu veux voir si besoin de plus de détail).",
      inputSchema: { url: z.string().describe("URL http(s) publique (pas localhost)") },
      handler: async (args): Promise<KernelToolResult> => {
        const url = String(args.url ?? "").trim();
        if (!/^https?:\/\//i.test(url)) {
          return { text: "URL invalide pour Sharingan — fournis une adresse http(s) publique (pas localhost).", isError: true };
        }
        try {
          const r = await deps.analyzeUrl(url);
          try { deps.publishRef({ project: projectName, palette: r.palette, source: "sharingan" }); } catch { /* best-effort */ }
          return { text: formatSharinganUrlText(r) };
        } catch (e) {
          return { text: `Échec de l'analyse Sharingan : ${(e as Error).message}`, isError: true };
        }
      },
    },
    {
      name: "sharingan_image",
      description:
        "Extrait la palette de couleurs réelle (hex) + une ambiance perceptuelle (luminosité/saturation/température) d'une image jointe (screenshot, photo, mockup dans .assets/). Déterministe (pas de LLM) — donne des valeurs hex EXACTES à ancrer dans la palette CSS, en complément de ta lecture visuelle native si tu en as une.",
      inputSchema: { path: z.string().describe("Chemin relatif ou absolu vers l'image (ex. .assets/ref.png)") },
      handler: async (args): Promise<KernelToolResult> => {
        const raw = String(args.path ?? "").trim();
        if (!raw) return { text: "Donne le chemin de l'image à analyser (ex. .assets/ref.png).", isError: true };
        const resolved = path.isAbsolute(raw) ? raw : path.join(projectDir, raw);
        try {
          const r = await deps.analyzeImage(resolved);
          if (r.palette.length > 0) {
            try { deps.publishRef({ project: projectName, palette: r.palette, source: "sharingan" }); } catch { /* best-effort */ }
          }
          return {
            text:
              `# Sharingan image — ${path.basename(resolved)}\n\n` +
              `## Palette dominante\n${r.palette.length ? r.palette.join(", ") : "(aucune couleur de design détectée)"}\n\n` +
              `## Ambiance perceptuelle\n${r.ambiance}\n\n` +
              `Utilise ces couleurs hex comme base de palette CSS (:root custom properties), reste fidèle à l'ambiance capturée.`,
          };
        } catch (e) {
          return { text: `Échec de l'analyse Sharingan image : ${(e as Error).message}`, isError: true };
        }
      },
    },
  ];
  return tools;
}
