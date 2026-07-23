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

line();
console.log("wireframe-fork — fusion Ideation (#196) : palette/composants");
line();

{
  // parseLayoutSpec : palette valide (5 hex) et composants extraits.
  const raw = '{"angle":"Visuel","rationale":"cartes","regions":[{"label":"Nav","x":0,"y":0,"w":100,"h":10}],' +
    '"palette":["#1a1a2e","#16213e","#0f3460","#e94560","#f5f5f5"],"components":["Card","Header"]}';
  const spec = parseLayoutSpec(raw, "fallback");
  check("palette extraite (5 hex)", spec?.palette?.length === 5);
  check("composants extraits", spec?.components?.length === 2 && spec.components[0] === "Card");
}
{
  // Palette invalide (mauvais format hex) ou incomplète (≠5) → ignorée, pas de crash, pas de palette partielle.
  const raw = '{"angle":"a","regions":[{"label":"X","x":0,"y":0,"w":10,"h":10}],"palette":["rouge","#fff"]}';
  const spec = parseLayoutSpec(raw, "fallback");
  check("palette invalide/incomplète → absente (pas de palette partielle)", spec?.palette === undefined);
}
{
  // Spec SANS palette (comportement historique) → rendu gris neutre, inchangé.
  const htmlGray = renderLayoutMockup({ angle: "a", rationale: "", regions: [{ label: "X", x: 0, y: 0, w: 10, h: 10 }] });
  check("sans palette → fond blanc historique", htmlGray.includes("background:#fff;font-family"));
  check("sans palette → boîte grise historique", htmlGray.includes("background:#eceff1"));
}
{
  // Spec AVEC palette → le rendu applique VRAIMENT les couleurs choisies, pas le gris.
  const spec: LayoutSpec = {
    angle: "Sombre néon", rationale: "",
    regions: [{ label: "X", x: 0, y: 0, w: 10, h: 10 }],
    palette: ["#0a0a0a", "#1a1a2e", "#e94560", "#f5f5f5", "#16213e"],
  };
  const html = renderLayoutMockup(spec);
  check("palette appliquée au fond du canevas", html.includes("background:#0a0a0a;font-family"));
  check("palette appliquée au fond des boîtes", html.includes("background:#1a1a2e"));
  check("texte clair sur fond sombre (lisibilité)", html.includes("color:#f5f5f5"));
  check("plus de gris neutre historique quand une palette est fournie", !html.includes("#eceff1"));
}
{
  // Fond clair de la palette → texte sombre choisi automatiquement (lisibilité).
  const spec: LayoutSpec = {
    angle: "Clair", rationale: "",
    regions: [{ label: "X", x: 0, y: 0, w: 10, h: 10 }],
    palette: ["#fefefe", "#f0f0f0", "#333333", "#111111", "#cccccc"],
  };
  const html = renderLayoutMockup(spec);
  check("texte sombre sur fond clair (lisibilité)", html.includes("color:#2b2b2b"));
}
{
  // Round-trip du choix AVEC palette/composants — le patron existant (perfect-plan.ts) tient telle quelle.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-fusion-test-"));
  try {
    const spec: LayoutSpec = {
      angle: "Visuel", rationale: "cartes modernes",
      regions: [{ label: "Hero", x: 0, y: 0, w: 100, h: 30 }],
      palette: ["#1a1a2e", "#16213e", "#0f3460", "#e94560", "#f5f5f5"],
      components: ["Card", "Header"],
    };
    saveWireframeChoice(dir, spec);
    const loaded = loadWireframeChoice(dir);
    check("round-trip palette fidèle", JSON.stringify(loaded?.spec.palette) === JSON.stringify(spec.palette));
    check("round-trip composants fidèle", JSON.stringify(loaded?.spec.components) === JSON.stringify(spec.components));
    const section = wireframeChoiceSection(spec);
    check("section d'injection mentionne la palette", section.includes("#e94560"));
    check("section d'injection mentionne les composants", section.includes("Card"));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

line("═");
console.log(failures === 0 ? "✅ wireframe-fork : tout est prouvé." : `❌ ${failures} échec(s)`);
process.exit(failures === 0 ? 0 : 1);
