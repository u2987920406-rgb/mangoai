// Tests de verifie_design (#182 suite, 2026-07-12) — auto-vérification design
// déterministe EN COURS de tâche. Déterministe, ZÉRO réseau : projet temporaire réel.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildEleveDesignTools } from "../eleve-tools/eleve-design-tools.js";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); } else { fail++; console.log(`  ✗ ${label}`); }
}

async function run(): Promise<void> {
  // ── projet vide → rien à vérifier ───────────────────────────────────────────
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), "eleve-design-empty-"));
  const toolsEmpty = buildEleveDesignTools(empty);
  check("verifie_design enregistré", toolsEmpty.some((t) => t.name === "verifie_design"));
  const rEmpty = await toolsEmpty.find((t) => t.name === "verifie_design")!.handler({});
  check("projet vide → message clair, pas d'erreur", rEmpty.text.includes("Aucun fichier") && !rEmpty.isError);

  // ── projet propre (contraste OK, palette custom properties, pas de littéral) ──
  const clean = fs.mkdtempSync(path.join(os.tmpdir(), "eleve-design-clean-"));
  fs.mkdirSync(path.join(clean, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(clean, "src", "index.css"),
    ":root { --bg: #ffffff; --fg: #111111; --accent: #7c5cff; }\n" +
      "body { color: var(--fg); background: var(--bg); font-size: 16px; }\n" +
      "h1 { font-size: clamp(2rem, 5vw, 3.5rem); }\n" +
      ".btn { transition: transform 200ms ease-out; }\n" +
      ".btn:hover { transform: translateY(-2px); }\n",
  );
  fs.writeFileSync(path.join(clean, "src", "App.jsx"), "export default function App(){ return <h1 className='title'>Bonjour</h1>; }\n");
  const toolsClean = buildEleveDesignTools(clean);
  const rClean = await toolsClean.find((t) => t.name === "verifie_design")!.handler({});
  check("projet propre → pas d'erreur", !rClean.isError);
  check("projet propre → message de conformité", rClean.text.startsWith("✓") || /aucun écart/i.test(rClean.text));

  // ── projet avec écarts (contraste faible + couleurs littérales) ─────────────
  const bad = fs.mkdtempSync(path.join(os.tmpdir(), "eleve-design-bad-"));
  fs.mkdirSync(path.join(bad, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(bad, "src", "index.css"),
    ".txt { color: #999999; background: #aaaaaa; font-size: 16px; }\n", // contraste très faible
  );
  const litColors = Array.from({ length: 12 }, (_, i) => `<div style={{color:'#${(100000 + i).toString(16)}'}}>x</div>`).join("\n");
  fs.writeFileSync(path.join(bad, "src", "App.jsx"), `export default function App(){ return (<div>${litColors}</div>); }\n`);
  const toolsBad = buildEleveDesignTools(bad);
  const rBad = await toolsBad.find((t) => t.name === "verifie_design")!.handler({});
  check("projet avec écarts → pas d'erreur (jamais isError)", !rBad.isError);
  check("projet avec écarts → signale des écarts", rBad.text.includes("Écarts de design détectés"));
  check("projet avec écarts → mentionne le contraste OU les littérales", /[Cc]ontraste|LITTÉRALES/.test(rBad.text));

  // ── ignore node_modules/dist ─────────────────────────────────────────────────
  const ignored = fs.mkdtempSync(path.join(os.tmpdir(), "eleve-design-ignored-"));
  fs.mkdirSync(path.join(ignored, "node_modules", "pkg"), { recursive: true });
  fs.writeFileSync(path.join(ignored, "node_modules", "pkg", "style.css"), ".x{color:#000;background:#000}\n");
  const toolsIgnored = buildEleveDesignTools(ignored);
  const rIgnored = await toolsIgnored.find((t) => t.name === "verifie_design")!.handler({});
  check("node_modules ignoré → rien à vérifier", rIgnored.text.includes("Aucun fichier"));

  fs.rmSync(empty, { recursive: true, force: true });
  fs.rmSync(clean, { recursive: true, force: true });
  fs.rmSync(bad, { recursive: true, force: true });
  fs.rmSync(ignored, { recursive: true, force: true });

  console.log(`\n${fail === 0 ? "✅" : "❌"} eleve-design-tools : ${pass} pass, ${fail} fail`);
  if (fail > 0) process.exit(1);
}

run().catch((e) => { console.error(e); process.exit(1); });
