// Tests de la fourche visuelle multi-wireframes (wireframe-fork.ts, 2026-07-13) —
// matching pur (renderLayoutMockup), génération injectée (generateLayoutVariants),
// et persistance du choix (patron perfect-plan.ts).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  renderLayoutMockup,
  parseLayoutSpec,
  generateLayoutVariants,
  saveWireframeChoice,
  loadWireframeChoice,
  deleteWireframeChoice,
  hasWireframeChoice,
  wireframeChoiceSection,
  type LayoutSpec,
} from "../wireframe-fork.js";
import { line, makeCheck } from "./test-util.js";

let failures = 0;
const check = makeCheck(() => { failures++; });

line("═");
console.log("wireframe-fork — parseLayoutSpec (extraction JSON tolérante)");
line();

{
  const raw = '```json\n{"angle":"Efficacité","rationale":"rapide","regions":[{"label":"Nav","x":0,"y":0,"w":100,"h":10}]}\n```';
  const spec = parseLayoutSpec(raw, "fallback");
  check("angle extrait", spec?.angle === "Efficacité");
  check("rationale extrait", spec?.rationale === "rapide");
  check("région extraite", spec?.regions.length === 1 && spec.regions[0]!.label === "Nav");
}

{
  check("JSON invalide → null", parseLayoutSpec("pas du json du tout", "x") === null);
  check("objet sans regions → null", parseLayoutSpec('{"angle":"a"}', "x") === null);
  check("regions vide → null", parseLayoutSpec('{"angle":"a","regions":[]}', "x") === null);
}

{
  // angle absent dans la réponse → repli sur l'angle demandé (fallback)
  const spec = parseLayoutSpec('{"regions":[{"label":"X","x":0,"y":0,"w":10,"h":10}]}', "Angle demandé");
  check("angle absent → repli sur fallback", spec?.angle === "Angle demandé");
}

{
  // une région malformée (label manquant, x non numérique) est écartée SANS invalider la spec
  const raw = '{"angle":"a","regions":[{"label":"OK","x":0,"y":0,"w":10,"h":10},{"label":"","x":0,"y":0,"w":10,"h":10},{"label":"NaN","x":"pas un nombre","y":0,"w":10,"h":10}]}';
  const spec = parseLayoutSpec(raw, "x");
  check("seule la région valide survit", spec?.regions.length === 1 && spec.regions[0]!.label === "OK");
}

line();
console.log("wireframe-fork — renderLayoutMockup (PUR, sans réseau/navigateur)");
line();

{
  const spec: LayoutSpec = {
    angle: "Test",
    rationale: "r",
    regions: [
      { label: "En-tête", x: 0, y: 0, w: 100, h: 10 },
      { label: "Corps", x: 0, y: 10, w: 100, h: 80 },
    ],
  };
  const html = renderLayoutMockup(spec);
  check("HTML valide (DOCTYPE)", html.startsWith("<!DOCTYPE html>"));
  check("les 2 libellés sont présents", html.includes("En-tête") && html.includes("Corps"));
  check("positions en % dans le style", html.includes("left:0%") && html.includes("top:10%"));
}

{
  // Positions hors-limites (négatif, >100) → clampées, jamais de HTML invalide/NaN
  const spec: LayoutSpec = {
    angle: "Hors-limites",
    rationale: "r",
    regions: [{ label: "Débordant", x: -50, y: 150, w: 500, h: -20 }],
  };
  const html = renderLayoutMockup(spec);
  check("aucun NaN dans le rendu", !html.includes("NaN"));
  check("aucune valeur négative résiduelle", !/-\d+%/.test(html));
}

{
  // Aucune région → HTML toujours valide (canevas vide, pas de crash)
  const spec: LayoutSpec = { angle: "Vide", rationale: "r", regions: [] };
  const html = renderLayoutMockup(spec);
  check("canevas vide reste un HTML valide", html.includes("</html>"));
}

{
  // Échappement HTML du libellé (anti-injection dans le rendu)
  const spec: LayoutSpec = { angle: "XSS", rationale: "r", regions: [{ label: "<script>x</script>", x: 0, y: 0, w: 10, h: 10 }] };
  const html = renderLayoutMockup(spec);
  check("libellé échappé, pas de balise script injectée", !html.includes("<script>x</script>") && html.includes("&lt;script&gt;"));
}

line();
console.log("wireframe-fork — generateLayoutVariants (ask injecté, sans réseau)");
line();

{
  let calls = 0;
  const ask = async (_system: string, user: string): Promise<string> => {
    calls++;
    const angle = /Angle structurel à explorer.*: (.+)/.exec(user)?.[1] ?? "?";
    return JSON.stringify({ angle, rationale: "r", regions: [{ label: "Zone", x: 0, y: 0, w: 100, h: 100 }] });
  };
  const specs = await generateLayoutVariants("une app de gestion", 3, { ask });
  check("3 appels séparés (pas un tableau en un seul appel)", calls === 3);
  check("3 specs distinctes obtenues", specs.length === 3);
  check("angles distincts (un par appel)", new Set(specs.map((s) => s.angle)).size === 3);
}

{
  // Un appel qui échoue n'invalide pas les autres
  let n = 0;
  const ask = async (): Promise<string> => {
    n++;
    if (n === 2) throw new Error("réseau injoignable");
    return JSON.stringify({ angle: `a${n}`, rationale: "r", regions: [{ label: "Z", x: 0, y: 0, w: 10, h: 10 }] });
  };
  const specs = await generateLayoutVariants("app", 3, { ask });
  check("échec d'une variante n'annule pas les autres", specs.length === 2);
}

{
  // JSON malformé sur toutes les tentatives → liste vide, jamais de throw
  const ask = async (): Promise<string> => "n'importe quoi, pas du JSON";
  const specs = await generateLayoutVariants("app", 3, { ask });
  check("JSON toujours invalide → liste vide (pas de throw)", specs.length === 0);
}

line();
console.log("wireframe-fork — persistance du choix (patron perfect-plan.ts)");
line();

{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wireframe-choice-"));
  const spec: LayoutSpec = {
    angle: "Visuel",
    rationale: "cartes modernes",
    regions: [{ label: "Hero", x: 0, y: 0, w: 100, h: 40 }],
  };
  check("aucun choix au départ", !hasWireframeChoice(dir));
  check("load renvoie null si absent", loadWireframeChoice(dir) === null);

  saveWireframeChoice(dir, spec);
  check("choix persisté (fichier présent)", hasWireframeChoice(dir));
  const loaded = loadWireframeChoice(dir);
  check("round-trip fidèle", loaded?.spec.angle === "Visuel" && loaded.spec.regions.length === 1);
  check("horodatage présent", typeof loaded?.chosenAt === "string" && loaded.chosenAt.length > 0);

  deleteWireframeChoice(dir);
  check("choix effacé", !hasWireframeChoice(dir));
  check("delete sur fichier déjà absent ne lève pas", (() => { deleteWireframeChoice(dir); return true; })());

  fs.rmSync(dir, { recursive: true, force: true });
}

{
  const section = wireframeChoiceSection({
    angle: "Action rapide",
    rationale: "tableau de bord",
    regions: [{ label: "Sidebar", x: 0, y: 0, w: 20, h: 100 }],
  });
  check("section d'injection mentionne l'angle", section.includes("Action rapide"));
  check("section d'injection mentionne la région", section.includes("Sidebar"));
}

line("═");
console.log(failures === 0 ? "✅ wireframe-fork : tout est prouvé." : `❌ ${failures} échec(s)`);
process.exit(failures === 0 ? 0 : 1);
