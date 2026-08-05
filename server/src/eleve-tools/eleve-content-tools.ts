// Outils « contenu » de l'Élève (transmission 2026-06-30) — gaté ELEVE_CONTENT=on.
//   • genere_contenu        : Mango rédige un LOT d'items structurés (JSON) validés (via GLM).
//   • verifie_coherence_images : Mango fait juger ses images par le VL et les corrige seul.
// Comble la lacune « produire et fiabiliser une banque de contenu » repérée en construisant
// TOEIC Quest (où Claude avait dû écrire des runners externes). Pattern habituel : KernelTool,
// deps injectées, ne lève jamais, repli pédagogique. PUR côté décision (cœur eleve-content.ts).

import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
import type { KernelTool, KernelToolResult } from "../kernel/kernel-mcp.js";
import { confinePath } from "../perimeter-context.js";
import { askLLM } from "../llm/llm-engine.js";
import { searchPexelsImages } from "../taste/taste-images.js";
import { ELEVE_MODEL, ELEVE_PROVIDER, ELEVE_API_URL, OLLAMA as ELEVE_OLLAMA_URL } from "../eleve/provider.js";
import { getBrain } from "../brain/brain-registry.js";
import {
  generateContentItems,
  checkImageCoherence,
  type GenContentDeps,
  type ImgCheckDeps,
  type ImgItem,
} from "../eleve-content.js";

// ── Dépendances réelles ──────────────────────────────────────────────────────

// Version du PROMPT de génération de contenu (buildContentPrompt, eleve-content.ts) —
// namespace le cache sémantique (#182 D5/É4) : un changement de forme de prompt
// busTe le cache au lieu de servir une réponse valide pour un autre gabarit.
const GENERE_CONTENU_PROMPT_VERSION = "genere-contenu-v1";

/** Réglages du cerveau rédacteur = l'Élève (GLM via OpenAI-compat), surchargés par env.
 * Appel PUR/sans effet de bord/idempotent (rédaction déterministe d'un lot JSON validé,
 * jamais un tour agentique outillé) → enveloppé du cache sémantique OPT-IN (#182 É4,
 * gate LLM_SEMANTIC_CACHE, défaut OFF = appel direct byte-identique). */
function glmAsk(): GenContentDeps["ask"] {
  // Raf (2026-07-11) : lit les bindings LIVE de eleve/provider.ts (resynchronisés
  // par syncEleveFromBrainRegistry à chaque sauvegarde Réglages), plus jamais
  // process.env.ELEVE_MODEL brut (figé au démarrage, source du bug "GLM-5.2 fantôme").
  const model = ELEVE_MODEL;
  const provider = ELEVE_PROVIDER;
  const baseUrl = provider === "ollama" ? ELEVE_OLLAMA_URL : ELEVE_API_URL;
  const real = (system: string, user: string) =>
    askLLM(system, user, {
      provider,
      model,
      baseUrl,
      apiKeyEnv: "ELEVE_API_KEY",
      maxTokens: 6000,
      timeoutMs: 180_000,
    });
  // Cache sémantique archivé au lot 2 : son gate était OFF depuis toujours,
  // `cachedComplete` n'était qu'un passe-plat vers `real`. Appel direct.
  return real;
}

// Raf (2026-07-11) : VL_MODEL était un 3e registre — une variable d'env SÉPARÉE de
// brain-registry.json, invisible à Réglages (même symptôme que "codeur" avant fix).
// Lit maintenant le rôle "vision" du registre en direct (getBrain relit le disque
// à chaque appel), .env reste le repli si le registre est absent/corrompu.
const VL_MODEL = () => getBrain("vision").model || process.env.VL_MODEL || "qwen3-vl:8b";
const OLLAMA = () => (process.env.OLLAMA_URL || "http://localhost:11434").replace(/\/$/, "") + "/api/generate";

async function realToBase64(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer()).toString("base64");
  } catch {
    return null;
  }
}

/** Juge VL local (qwen3-vl). think:false + parsing de repli dans `thinking` (modèle « thinking »). */
async function realJudge(b64: string, scene: string): Promise<boolean | null> {
  const prompt =
    `Look at the photo. A description says it shows: "${scene}". ` +
    `Does the photo clearly and reasonably depict that scene? ` +
    `Reply ONLY JSON: {"match": true} or {"match": false}.`;
  try {
    const res = await fetch(OLLAMA(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: VL_MODEL(), prompt, images: [b64], stream: false, think: false, format: "json", options: { temperature: 0 } }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { response?: string; thinking?: string };
    const blob = (data.response && data.response.trim()) || (data.thinking && data.thinking.trim()) || "";
    const m = blob.match(/\{[^{}]*"match"[^{}]*\}/i);
    if (!m) return null;
    return (JSON.parse(m[0]) as { match?: boolean }).match === true;
  } catch {
    return null;
  }
}

const realImgDeps: ImgCheckDeps = {
  toBase64: realToBase64,
  judge: realJudge,
  search: async (query, n) => {
    try {
      const imgs = await searchPexelsImages(query, n);
      return imgs.map((i) => ({ url: i.url }));
    } catch {
      return [];
    }
  },
};

export interface ContentToolDeps {
  ask: GenContentDeps["ask"];
  img: ImgCheckDeps;
  readFile: (abs: string) => string;
  writeFile: (abs: string, data: string) => void;
}

function realDeps(): ContentToolDeps {
  return {
    ask: glmAsk(),
    img: realImgDeps,
    readFile: (abs) => fs.readFileSync(abs, "utf8"),
    writeFile: (abs, data) => {
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, data);
    },
  };
}

// Empêche d'écrire/lire hors du projet.
// (#180 É2) `access` distingue l'écriture (genere_contenu) de la lecture
// (verifie_coherence_images). Gate OFF = byte-identique quel que soit `access`.
function resolveInside(root: string, rel: string, access: "read" | "write" = "write"): string {
  return confinePath(root, rel, access);
}

// ── Les deux outils ──────────────────────────────────────────────────────────

export function buildEleveContentTools(projectDir: string, deps: ContentToolDeps = realDeps()): KernelTool[] {
  const genereContenu: KernelTool = {
    name: "genere_contenu",
    description:
      "RÉDIGE un LOT de données structurées (questions, fiches, entrées de catalogue, leçons…) et l'enregistre en JSON dans le projet. Donne `sujet` (le thème), `schema` (décris la FORME d'un item, ex. « {question, choix:[4], reponse:index, explication} »), `n` (nombre). Options : `cles_requises` (clés obligatoires, validées) · `langue` (des champs texte) · `fichier` (chemin de sortie, défaut src/data/contenu.json). Idéal pour peupler une app de formation/quiz/catalogue sans tout écrire à la main.",
    inputSchema: {
      sujet: z.string().describe("Thème du lot, ex. « questions de grammaire anglaise niveau A2 »"),
      schema: z.string().describe("Forme d'UN item, ex. « {question:string, choix:string[4], reponse:number(0-3), explication:string} »"),
      n: z.number().int().min(1).max(50).describe("Nombre d'items à produire (1-50)"),
      cles_requises: z.array(z.string()).optional().describe("Clés qui DOIVENT être présentes dans chaque item"),
      langue: z.string().optional().describe("Langue des champs de texte libre (ex. « français »)"),
      fichier: z.string().optional().describe("Chemin de sortie relatif (défaut src/data/contenu.json)"),
    },
    handler: async (args): Promise<KernelToolResult> => {
      const sujet = String(args.sujet ?? "").trim();
      const schema = String(args.schema ?? "").trim();
      if (!sujet || !schema) return { text: "Donne au moins `sujet` et `schema` (la forme d'un item).", isError: true };
      const clesRequises = Array.isArray(args.cles_requises) ? (args.cles_requises as unknown[]).map(String) : undefined;
      const res = await generateContentItems(
        { sujet, schema, n: Number(args.n ?? 10), langue: args.langue ? String(args.langue) : undefined, clesRequises },
        { ask: deps.ask },
      );
      if (!res.ok) {
        return { text: `Génération impossible : ${res.error}. Reformule le schéma ou réduis n.`, isError: true };
      }
      const rel = args.fichier ? String(args.fichier) : "src/data/contenu.json";
      try {
        const abs = resolveInside(projectDir, rel);
        deps.writeFile(abs, JSON.stringify(res.items, null, 2) + "\n");
        const sample = JSON.stringify(res.items[0]).slice(0, 200);
        return {
          text:
            `${res.items.length} items rédigés et enregistrés dans ${rel}.\n` +
            `Exemple : ${sample}…\n` +
            `Importe-les dans ton app (ex. \`import data from "./data/${path.basename(rel)}"\`).`,
        };
      } catch (e) {
        return { text: `Items générés mais non enregistrés : ${e instanceof Error ? e.message : String(e)}`, isError: true };
      }
    },
  };

  const verifieCoherenceImages: KernelTool = {
    name: "verifie_coherence_images",
    description:
      "VÉRIFIE qu'un fichier JSON d'items dont chacun porte une image illustre BIEN la scène décrite, en faisant juger chaque image par l'ŒIL (modèle vision local). En cas d'incohérence, re-cherche une meilleure photo (Pexels) et corrige le fichier. Donne `fichier` (le JSON), `champ_image` (clé de l'URL, défaut « image ») et `champ_scene` (clé de la description que l'image doit montrer). Garantit que « les images correspondent aux textes ».",
    inputSchema: {
      fichier: z.string().describe("Chemin relatif du fichier JSON (tableau d'objets) à vérifier"),
      champ_image: z.string().optional().describe("Clé portant l'URL de l'image (défaut « image »)"),
      champ_scene: z.string().optional().describe("Clé portant la description que l'image doit illustrer (défaut « scene »)"),
      corriger: z.boolean().optional().describe("Remplacer l'image en cas d'incohérence (défaut true)"),
    },
    handler: async (args): Promise<KernelToolResult> => {
      const rel = String(args.fichier ?? "").trim();
      if (!rel) return { text: "Donne le `fichier` JSON à vérifier.", isError: true };
      let items: ImgItem[];
      let abs: string;
      try {
        abs = resolveInside(projectDir, rel, "read");
        const parsed = JSON.parse(deps.readFile(abs));
        if (!Array.isArray(parsed)) return { text: `${rel} n'est pas un tableau JSON d'items.`, isError: true };
        items = parsed as ImgItem[];
      } catch (e) {
        return { text: `Lecture de ${rel} impossible : ${e instanceof Error ? e.message : String(e)}`, isError: true };
      }
      const opts = {
        champImage: args.champ_image ? String(args.champ_image) : "image",
        champScene: args.champ_scene ? String(args.champ_scene) : "scene",
        corriger: args.corriger !== false,
      };
      const r = await checkImageCoherence(items, opts, deps.img);
      if (r.fixed > 0) {
        try {
          // (#180 É2) La correction ÉCRIT → re-confine en accès `write` : un coffre
          // en lecture seule (acteur autonome) refuse l'écriture même si la lecture
          // ci-dessus l'a acceptée. Gate OFF → même `abs`, byte-identique.
          const absWrite = resolveInside(projectDir, rel, "write");
          deps.writeFile(absWrite, JSON.stringify(items, null, 2) + "\n");
        } catch {
          /* écriture best-effort : le rapport reste utile */
        }
      }
      const flagTxt = r.flags.length ? `\nEncore incohérentes : ${r.flags.map((f) => `« ${f} »`).join(", ")}` : "";
      if (r.checked === 0) {
        return { text: `Aucun item avec image+scène trouvé (clés « ${opts.champImage} »/« ${opts.champScene} » ?).`, isError: true };
      }
      return {
        text: `Cohérence images : ${r.checked} vérifiées · ${r.ok} OK · ${r.fixed} corrigées · ${r.flagged} à revoir.${flagTxt}`,
      };
    },
  };

  return [genereContenu, verifieCoherenceImages];
}
