// #196 partie D (2026-07-23) — diagrammes avant/après (« /illustre »). Vraie nouvelle
// capacité (contrairement aux parties A-C, qui fusionnaient/formalisaient de l'existant).
//
// Choix technique ASSUMÉ : la vidéo « 6 skills » montre le format Excalidraw natif,
// mais reconstruire un moteur Excalidraw (bibliothèque canvas complète) serait
// disproportionné pour la valeur. Mermaid (syntaxe TEXTE, qu'un LLM génère aussi
// fiablement que du JSON) rendu en image via le MÊME pipeline déjà prouvé aujourd'hui
// (HTML → capture Playwright, patron `renderMockupScreenshot` de vision.ts, déjà
// utilisé pour les mockups de wireframe-fork.ts) donne le même résultat utile — « un
// diagramme qui argumente, pas juste des composants listés » — sans bâtir un second
// moteur de rendu. Sortie JPEG (pas de fichier .excalidraw téléchargeable) — portée
// volontairement limitée pour une v1 (pas d'édition manuelle, juste régénérer).
import fs from "node:fs";
import path from "node:path";
import type { Express } from "express";
import { resolveProvider } from "./llm/llm-engine.js";
import { getBrain } from "./kernel.js";
import { getBrowser } from "./vision.js";
import { projectDir, projectExists } from "./projects.js";

export interface DiagramSpec {
  mermaid: string; // syntaxe Mermaid autonome (flowchart/graph/sequenceDiagram…)
  caption: string; // 1 phrase : ce que le diagramme DÉMONTRE (pas une liste de composants)
}

const DIAGRAM_SYSTEM_PROMPT =
  "Tu es un architecte logiciel. On te donne l'intention d'un projet et un MOMENT à illustrer. " +
  "Génère un diagramme Mermaid qui ARGUMENTE une structure ou un flux (pas une simple liste de composants empilés) : " +
  "les relations entre les parties, le flux de données, ou les décisions clés. " +
  "Réponds UNIQUEMENT par un objet JSON valide (zéro markdown, zéro backtick) avec EXACTEMENT ces champs : " +
  '{"mermaid": "flowchart TD\\n  A[...] --> B[...]", "caption": "1 phrase : ce que ce diagramme démontre"} ' +
  "— le champ mermaid doit être une syntaxe Mermaid VALIDE et autonome (commence par flowchart/graph/sequenceDiagram), " +
  "échappe les caractères spéciaux dans les libellés, jamais de texte hors du JSON.";

export type DiagramAsk = (system: string, user: string) => Promise<string>;

const defaultAsk: DiagramAsk = (system, user) =>
  getBrain().complete(system, user, {
    provider: resolveProvider(process.env.DIAGRAM_PROVIDER),
    maxTokens: 800,
    timeoutMs: 60_000,
  });

/** Extrait et valide un DiagramSpec depuis la sortie brute (1er `{` … dernier `}`),
 *  tolérant les fences markdown. Ne lève jamais — null si hors-format ou mermaid vide. */
export function parseDiagramSpec(raw: string): DiagramSpec | null {
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
  const mermaid = typeof o.mermaid === "string" ? o.mermaid.trim() : "";
  if (!mermaid) return null;
  const caption = typeof o.caption === "string" ? o.caption.trim() : "";
  return { mermaid, caption };
}

/** Génère UN diagramme (avant = architecture PRÉVUE · après = ce qui a été RÉELLEMENT
 *  construit) — un appel LLM, repli honnête (null) si l'appel échoue ou renvoie
 *  hors-format. Ne lève jamais. */
export async function generateDiagram(
  intention: string,
  kind: "avant" | "apres",
  deps: { ask?: DiagramAsk } = {},
): Promise<DiagramSpec | null> {
  const ask = deps.ask ?? defaultAsk;
  const momentLabel =
    kind === "avant"
      ? "AVANT tout code — l'architecture PRÉVUE, pour argumenter les choix avant de construire"
      : "APRÈS construction — ce qui a été RÉELLEMENT bâti (pas ce qui était prévu)";
  const user = `Intention du projet :\n"${intention.trim()}"\n\nMoment à illustrer : ${momentLabel}.\n\nGénère le diagramme.`;
  try {
    const raw = await ask(DIAGRAM_SYSTEM_PROMPT, user);
    return parseDiagramSpec(raw);
  } catch {
    return null;
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

let mermaidScriptCache: string | null = null;
/** Charge le bundle Mermaid EMBARQUÉ (npm, pas de CDN — cohérent avec l'usage local
 *  du reste de vision.ts) une seule fois, en cache pour tout le process. */
function loadMermaidScript(): string {
  if (mermaidScriptCache !== null) return mermaidScriptCache;
  const p = path.join(process.cwd(), "node_modules", "mermaid", "dist", "mermaid.min.js");
  mermaidScriptCache = fs.readFileSync(p, "utf8");
  return mermaidScriptCache;
}

/** Rend une syntaxe Mermaid en JPEG — patron `renderMockupScreenshot` (vision.ts) :
 *  page HTML statique, `getBrowser()` partagé, capture plein cadre. Diffère par
 *  l'attente explicite du `<svg>` que Mermaid injecte de façon ASYNCHRONE (le rendu
 *  n'est pas prêt au simple `load` du document, contrairement à un mockup statique). */
export async function renderDiagram(mermaidSource: string): Promise<Buffer> {
  const script = loadMermaidScript();
  const html =
    "<!DOCTYPE html><html><head><style>" +
    "body{margin:0;background:#0b0d12;display:flex;align-items:center;justify-content:center;padding:32px;box-sizing:border-box;font-family:system-ui,sans-serif;}" +
    "</style></head><body>" +
    `<pre class="mermaid">${escapeHtml(mermaidSource)}</pre>` +
    `<script>${script}</script>` +
    '<script>mermaid.initialize({startOnLoad:true,theme:"dark"});</script>' +
    "</body></html>";
  const b = await getBrowser();
  const context = await b.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
  try {
    const page = await context.newPage();
    await page.setContent(html, { waitUntil: "load" });
    const svg = page.locator("svg");
    await svg.waitFor({ state: "attached", timeout: 15_000 });
    // Recadre STRICTEMENT sur le SVG rendu (+ marge) — un plein-cadre laissait un
    // immense vide noir autour d'un petit diagramme (constat en vérification réelle,
    // 2026-07-23) : Mermaid dimensionne son SVG à son contenu, pas au viewport.
    const box = await svg.boundingBox();
    if (!box) return await page.screenshot({ type: "jpeg", quality: 88, fullPage: true });
    const pad = 24;
    return await page.screenshot({
      type: "jpeg",
      quality: 88,
      clip: { x: Math.max(0, box.x - pad), y: Math.max(0, box.y - pad), width: box.width + pad * 2, height: box.height + pad * 2 },
    });
  } finally {
    await context.close().catch(() => {});
  }
}

const DIAGRAM_NAME_RE = /^(avant|apres)-\d+\.jpg$/;

function diagramsDir(project: string): string {
  return path.join(projectDir(project), ".diagrams");
}

/** Génère ET rend UN diagramme, le sauvegarde dans `.diagrams/<kind>-<ts>.jpg` —
 *  fonction UNIQUE partagée par la route REST et les déclencheurs automatiques
 *  (avant/après), pour ne jamais dupliquer la boucle. Ne lève jamais — null si la
 *  génération OU le rendu échoue (best-effort, ne bloque jamais le tour appelant). */
export async function generateAndSaveDiagram(
  project: string,
  intention: string,
  kind: "avant" | "apres",
  deps: { ask?: DiagramAsk } = {},
): Promise<{ name: string; caption: string } | null> {
  const spec = await generateDiagram(intention, kind, deps);
  if (!spec) return null;
  try {
    const buf = await renderDiagram(spec.mermaid);
    const dir = diagramsDir(project);
    fs.mkdirSync(dir, { recursive: true });
    const name = `${kind}-${Date.now()}.jpg`;
    fs.writeFileSync(path.join(dir, name), buf); // binaire — patron images-routes.ts, pas atomicWriteFileSync (texte)
    fs.writeFileSync(path.join(dir, `${name}.caption.txt`), spec.caption);
    return { name, caption: spec.caption };
  } catch {
    return null;
  }
}

export function listDiagrams(project: string): { name: string; kind: "avant" | "apres"; caption: string; mtime: number }[] {
  const dir = diagramsDir(project);
  try {
    return fs
      .readdirSync(dir)
      .filter((f) => DIAGRAM_NAME_RE.test(f))
      .map((f) => {
        const st = fs.statSync(path.join(dir, f));
        let caption = "";
        try {
          caption = fs.readFileSync(path.join(dir, `${f}.caption.txt`), "utf8").trim();
        } catch {
          /* légende absente — n'empêche pas d'afficher l'image */
        }
        return { name: f, kind: (f.startsWith("avant-") ? "avant" : "apres") as "avant" | "apres", caption, mtime: st.mtimeMs };
      })
      .sort((a, b) => b.mtime - a.mtime);
  } catch {
    return [];
  }
}

export function registerDiagramRoutes(app: Express): void {
  // POST /api/diagram/:name { kind: "avant" | "apres", intention }
  app.post("/api/diagram/:name", async (req, res) => {
    const project = req.params["name"] as string;
    if (!projectExists(project)) {
      res.status(400).json({ error: "projet inconnu" });
      return;
    }
    const { kind, intention } = req.body as { kind?: string; intention?: string };
    if (kind !== "avant" && kind !== "apres") {
      res.status(400).json({ error: 'kind doit être "avant" ou "apres"' });
      return;
    }
    if (!intention || !intention.trim()) {
      res.status(400).json({ error: "intention requise" });
      return;
    }
    const result = await generateAndSaveDiagram(project, intention, kind);
    if (!result) {
      res.status(502).json({ error: "génération ou rendu du diagramme échoué" });
      return;
    }
    res.json({ ...result, url: `/api/diagram/${encodeURIComponent(project)}/file/${result.name}` });
  });

  app.get("/api/diagram/:name/list", (req, res) => {
    const project = req.params["name"] as string;
    if (!projectExists(project)) {
      res.json({ diagrams: [] });
      return;
    }
    res.json({
      diagrams: listDiagrams(project).map((d) => ({ ...d, url: `/api/diagram/${encodeURIComponent(project)}/file/${d.name}` })),
    });
  });

  app.get("/api/diagram/:name/file/:file", (req, res) => {
    const project = req.params["name"] as string;
    const file = req.params["file"] as string;
    if (!projectExists(project) || !DIAGRAM_NAME_RE.test(file)) {
      res.status(404).json({ error: "introuvable" });
      return;
    }
    const dir = diagramsDir(project);
    const abs = path.resolve(dir, file);
    if (!abs.startsWith(path.resolve(dir)) || !fs.existsSync(abs)) {
      res.status(404).json({ error: "introuvable" });
      return;
    }
    // dotfiles:"allow" — sans ça, `send` (sous-jacent à res.sendFile) IGNORE tout
    // segment de chemin commençant par un point (dont `.diagrams/`, notre dossier)
    // et renvoie 404 silencieusement — trouvé en vérification réelle (2026-07-23).
    res.sendFile(abs, { dotfiles: "allow" });
  });
}
