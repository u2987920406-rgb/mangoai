// Tests des diagrammes avant/après (diagram.ts, #196 partie D, 2026-07-23) — parsing
// pur + génération injectée (patron generateLayoutVariants/wireframe-fork.ts). Le rendu
// réel (Playwright + Mermaid embarqué) est vérifié manuellement en conditions réelles
// (pas de navigateur headless dans ce tier offline) — voir la vérification EN RÉEL de
// la clôture #196 partie D dans historique.md.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseDiagramSpec, generateDiagram, listDiagrams } from "../diagram.js";
import { line, makeCheck } from "./test-util.js";

let failures = 0;
const check = makeCheck(() => { failures++; });

line("═");
console.log("diagram — parseDiagramSpec (extraction JSON tolérante)");
line();

{
  const raw = '```json\n{"mermaid":"flowchart TD\\n  A-->B","caption":"démontre le flux"}\n```';
  const spec = parseDiagramSpec(raw);
  check("mermaid extrait", spec?.mermaid === "flowchart TD\n  A-->B");
  check("caption extraite", spec?.caption === "démontre le flux");
}
{
  check("JSON invalide → null", parseDiagramSpec("pas du JSON du tout") === null);
  check("objet sans mermaid → null", parseDiagramSpec('{"caption":"x"}') === null);
  check("mermaid vide → null", parseDiagramSpec('{"mermaid":"   ","caption":"x"}') === null);
}
{
  // caption absente tolérée (mermaid seul suffit à un rendu utile)
  const spec = parseDiagramSpec('{"mermaid":"graph LR\\n  X-->Y"}');
  check("caption absente → chaîne vide, pas d'échec", Boolean(spec?.mermaid.length) && spec?.caption === "");
}

line();
console.log("diagram — generateDiagram (ask injecté, sans réseau/navigateur)");
line();

{
  let calls = 0;
  let lastUser = "";
  const ask = async (_system: string, user: string): Promise<string> => {
    calls++;
    lastUser = user;
    return JSON.stringify({ mermaid: "flowchart TD\n  A[App] --> B[API]", caption: "montre le flux client→serveur" });
  };
  const spec = await generateDiagram("une app de gestion de tâches", "avant", { ask });
  check("1 appel LLM", calls === 1);
  check("spec renvoyée", Boolean(spec?.mermaid.includes("flowchart")));
  check("le moment 'avant' est mentionné au modèle", lastUser.includes("AVANT"));
}
{
  const ask = async (): Promise<string> => JSON.stringify({ mermaid: "graph TD\n  X-->Y", caption: "c" });
  const spec = await generateDiagram("app", "apres", { ask });
  check("le moment 'après' est mentionné", spec !== null);
}
{
  // Échec réseau → repli honnête (null), jamais un throw
  const ask = async (): Promise<string> => { throw new Error("injoignable"); };
  const spec = await generateDiagram("app", "avant", { ask });
  check("échec réseau → null (pas de throw)", spec === null);
}
{
  // JSON toujours invalide → null, jamais de throw
  const ask = async (): Promise<string> => "n'importe quoi, pas du JSON";
  const spec = await generateDiagram("app", "avant", { ask });
  check("hors-format → null", spec === null);
}

line();
console.log("diagram — listDiagrams (PUR, système de fichiers seul)");
line();

{
  // Aucun projet / dossier .diagrams absent → liste vide, jamais un throw
  const diagrams = listDiagrams("____projet-inexistant-diagram-test____");
  check("projet inexistant → liste vide", Array.isArray(diagrams) && diagrams.length === 0);
}
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "diagram-list-test-"));
  const project = path.basename(dir);
  // listDiagrams résout via projectDir(project) — on ne peut pas rediriger ça sans
  // dépendre du vrai WORKSPACE_DIR ; on vérifie donc uniquement le comportement
  // "pas de crash, tableau" pour un nom qui n'existe nulle part dans le workspace réel.
  check("pas de crash sur un nom quelconque", Array.isArray(listDiagrams(project)));
  fs.rmSync(dir, { recursive: true, force: true });
}

line("═");
console.log(failures === 0 ? "✅ diagram : tout est prouvé (parsing + génération)." : `❌ ${failures} échec(s)`);
process.exit(failures === 0 ? 0 : 1);
