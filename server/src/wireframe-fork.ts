// Fourche visuelle multi-wireframes (2026-07-13) — avant que Construire n'écrive le
// moindre fichier sur un NOUVEAU projet (mode Élite), MangoOS propose 3 structures
// distinctes, RENDUES en vraies images (pas de l'ASCII), et attend un choix avant de
// construire. Évite le "premier jet générique" d'un app-builder qui part directement
// de l'intention au code (discussion Raf/Gemini, 2026-07-13).
//
// Discipline : l'Élève ne produit PAS de HTML — un petit modèle local (Qwythos-9B)
// génère facilement du HTML cassé (= capture blanche, aucune info). Il produit un
// JSON de RÉGIONS nommées (label + position/taille en %), que MangoOS rend
// déterministiquement en un gabarit HTML/CSS toujours valide. Même discipline que
// processScraped/evaluateGate ce soir : un garde-fou déterministe autour d'une
// sortie de modèle non fiable.
//
// Génération EN N APPELS SÉPARÉS (pas un tableau en un seul appel) — patron
// agent-forge.ts::forgeAgents ("LE GESTE : Mango forge N agents UN À LA FOIS,
// réponses courtes = jamais tronquées"), pensé exactement pour un petit modèle
// local comme Qwythos-9B (revue par un agent Plan dédié avant implémentation).

import fs from "node:fs";
import path from "node:path";
import { resolveProvider } from "./llm/llm-engine.js";
import { getBrain } from "./kernel.js";
import { atomicWriteFileSync } from "./safe-io.js";
import { renderMockupScreenshot } from "./vision.js";

export interface LayoutRegion {
  label: string;
  x: number; // % 0-100 du canevas
  y: number;
  w: number;
  h: number;
}

export interface LayoutSpec {
  angle: string;
  rationale: string;
  regions: LayoutRegion[];
}

const SYSTEM_PROMPT =
  "Tu es un architecte UX. On te donne l'intention d'une application et un angle structurel à explorer pour sa page principale. " +
  "Réponds UNIQUEMENT par un objet JSON valide (zéro markdown, zéro backtick) avec EXACTEMENT ces champs : " +
  '{"angle": "repris tel quel", "rationale": "1 phrase : pourquoi cette structure sert cet angle", ' +
  '"regions": [{"label": "nom de la zone", "x": 0, "y": 0, "w": 100, "h": 100}]} ' +
  "— 4 à 8 régions nommées, x/y/w/h en POURCENTAGE 0-100 du canevas, sans chevauchement grossier, couvrant l'essentiel de la page.";

const DEFAULT_ANGLES = [
  "Efficacité — liste épurée, minimaliste",
  "Visuel — cartes modernes, grands espaces",
  "Action rapide — tableau de bord, actions principales accessibles",
];

export type WireframeAsk = (system: string, user: string) => Promise<string>;

const defaultAsk: WireframeAsk = (system, user) =>
  getBrain().complete(system, user, {
    provider: resolveProvider(process.env.WIREFRAME_FORK_PROVIDER, "ollama"),
    maxTokens: 800,
    // (2026-07-13, preuve live) 30s était trop court : un petit modèle local avec
    // trace de raisonnement ("thinking") peut prendre 30-90s pour une seule spec
    // JSON structurée — mesuré en conditions réelles sur Qwythos-9B.
    timeoutMs: 120_000,
  });

/** Extrait et valide UNE spec depuis la sortie brute (1er `{` … dernier `}`), tolérant
 *  les fences markdown. Régions invalides écartées individuellement. Ne lève jamais. */
export function parseLayoutSpec(raw: string, fallbackAngle: string): LayoutSpec | null {
  const txt = (raw ?? "").trim().replace(/```(?:json)?/gi, "").trim();
  const start = txt.indexOf("{");
  const end = txt.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  let obj: unknown;
  try {
    obj = JSON.parse(txt.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  const regionsRaw = Array.isArray(o.regions) ? o.regions : [];
  const regions: LayoutRegion[] = regionsRaw
    .map((r): LayoutRegion | null => {
      if (!r || typeof r !== "object") return null;
      const rr = r as Record<string, unknown>;
      const label = typeof rr.label === "string" ? rr.label.trim() : "";
      const x = Number(rr.x);
      const y = Number(rr.y);
      const w = Number(rr.w);
      const h = Number(rr.h);
      if (!label || [x, y, w, h].some((n) => !Number.isFinite(n))) return null;
      return { label, x, y, w, h };
    })
    .filter((r): r is LayoutRegion => r !== null);
  if (regions.length === 0) return null;
  const angle = typeof o.angle === "string" && o.angle.trim() ? o.angle.trim() : fallbackAngle;
  const rationale = typeof o.rationale === "string" ? o.rationale.trim() : "";
  return { angle, rationale, regions };
}

/**
 * Génère N variantes de structure pour une intention — UN appel LLM PAR VARIANTE
 * (jamais un tableau en un seul appel, cf. discipline agent-forge.ts). Une variante
 * ratée (réseau, JSON invalide) n'annule pas les autres. Ne lève jamais.
 */
export async function generateLayoutVariants(
  intention: string,
  n = 3,
  deps: { ask?: WireframeAsk } = {},
): Promise<LayoutSpec[]> {
  const ask = deps.ask ?? defaultAsk;
  const count = Math.max(1, Math.min(5, Math.floor(n) || 3));
  const angles = DEFAULT_ANGLES.slice(0, count);
  while (angles.length < count) angles.push(`Variante ${angles.length + 1}`);

  const out: LayoutSpec[] = [];
  for (const angle of angles) {
    const user =
      `Intention du projet :\n"${intention.trim()}"\n\n` +
      `Angle structurel à explorer pour la page principale : ${angle}\n\n` +
      "Agence la page selon CET angle précis.";
    let raw = "";
    try {
      raw = await ask(SYSTEM_PROMPT, user);
    } catch {
      continue;
    }
    const spec = parseLayoutSpec(raw, angle);
    if (spec) out.push(spec);
  }
  return out;
}

export interface WireframeVariant {
  id: number;
  angle: string;
  rationale: string;
  regions: LayoutRegion[];
  imageBase64: string;
}

/** Génère N variantes ET les rend/capture en images — FONCTION UNIQUE partagée par
 *  la route REST (`wireframe-fork-routes.ts`) et le câblage inline du tour de chat
 *  (`chat-route.ts`), pour ne JAMAIS dupliquer la boucle (et le risque d'oubli d'un
 *  champ, comme `regions`, entre les deux). Capture EN SÉQUENCE (patron
 *  taste-render.ts — un seul `getBrowser()` partagé). Ne lève jamais. */
export async function generateAndRenderVariants(
  intention: string,
  n = 3,
  deps: { ask?: WireframeAsk } = {},
): Promise<WireframeVariant[]> {
  const specs = await generateLayoutVariants(intention, n, deps);
  const out: WireframeVariant[] = [];
  for (let i = 0; i < specs.length; i++) {
    const spec = specs[i]!;
    const buf = await renderMockupScreenshot(renderLayoutMockup(spec));
    out.push({ id: i, angle: spec.angle, rationale: spec.rationale, regions: spec.regions, imageBase64: buf.toString("base64") });
  }
  return out;
}

// ── Rendu déterministe (PUR, testable sans réseau) ──────────────────────────

const CANVAS_W = 800;
const CANVAS_H = 500;

const clamp = (n: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, Number.isFinite(n) ? n : lo));

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Rend une spec en HTML/CSS de boîtes étiquetées, TOUJOURS valide quel que soit le
 *  contenu de `regions` (positions hors-limites clampées, régions vides tolérées).
 *  PUR — aucun réseau, aucun navigateur. */
export function renderLayoutMockup(spec: LayoutSpec): string {
  const boxes = (spec.regions ?? [])
    .map((r) => {
      const x = clamp(r.x, 0, 99);
      const y = clamp(r.y, 0, 99);
      const w = clamp(r.w, 1, 100 - x);
      const h = clamp(r.h, 1, 100 - y);
      const label = escapeHtml(r.label || "");
      return (
        `<div style="position:absolute;left:${x}%;top:${y}%;width:${w}%;height:${h}%;` +
        "box-sizing:border-box;border:1px solid #9aa0a6;background:#eceff1;" +
        "display:flex;align-items:center;justify-content:center;" +
        `font:12px system-ui,sans-serif;color:#37474f;overflow:hidden;padding:4px;text-align:center;">${label}</div>`
      );
    })
    .join("");
  return (
    "<!DOCTYPE html><html><body style=\"margin:0;\">" +
    `<div style="position:relative;width:${CANVAS_W}px;height:${CANVAS_H}px;background:#fff;font-family:system-ui,sans-serif;">${boxes}</div>` +
    "</body></html>"
  );
}

// ── Persistance du choix (patron perfect-plan.ts, revue post-approbation) ──────

const CHOICE_FILE = ".wireframe-fork-choice.json";

export interface WireframeChoice {
  spec: LayoutSpec;
  chosenAt: string;
}

export function hasWireframeChoice(dir: string): boolean {
  return fs.existsSync(path.join(dir, CHOICE_FILE));
}

export function loadWireframeChoice(dir: string): WireframeChoice | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, CHOICE_FILE), "utf8")) as WireframeChoice;
  } catch {
    return null;
  }
}

export function saveWireframeChoice(dir: string, spec: LayoutSpec): void {
  fs.mkdirSync(dir, { recursive: true });
  const choice: WireframeChoice = { spec, chosenAt: new Date().toISOString() };
  atomicWriteFileSync(path.join(dir, CHOICE_FILE), JSON.stringify(choice, null, 2));
}

export function deleteWireframeChoice(dir: string): void {
  try {
    fs.unlinkSync(path.join(dir, CHOICE_FILE));
  } catch {
    /* déjà absent */
  }
}

/** Bloc d'injection pour le prompt/contexte du tour Construire suivant. */
export function wireframeChoiceSection(spec: LayoutSpec): string {
  const regions = spec.regions.map((r) => `  - ${r.label} (x:${r.x}%, y:${r.y}%, w:${r.w}%, h:${r.h}%)`).join("\n");
  return `Structure choisie par l'utilisateur (angle « ${spec.angle} » — ${spec.rationale}) :\n${regions}\nRespecte cette structure comme base de l'agencement de la page principale.`;
}
