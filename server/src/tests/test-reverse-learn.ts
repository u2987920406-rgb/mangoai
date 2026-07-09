// Preuve de reverse-learn.ts (#104 Phase 1) — déterministe, sans réseau.
// askLLM est injecté (faux expert) ; saveProcedure écrit de VRAIS fichiers dans
// un workspace temporaire.
//
// Lancer : npx tsx src/test-reverse-learn.ts

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { computeDiff, diffToText, parseProcedureJson, learnFromSolution, type ReverseLearnDeps } from "../reverse-learn.js";
import { listProcedures, loadProcedure } from "../procedures.js";

let failures = 0;
function check(label: string, cond: boolean) {
  console.log(`  ${cond ? "✓" : "✗"} ${label}`);
  if (!cond) failures++;
}

function mk(dir: string, rel: string, content: string) {
  const abs = path.join(dir, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
}

async function main() {
  console.log("═".repeat(64));
  console.log("REVERSE-LEARN (#104 Phase 1) — déterministe");
  console.log("═".repeat(64));

  // ── Fixtures : un "avant Gemma" (template) et un "après Claude" (features) ──
  const gemma = fs.mkdtempSync(path.join(os.tmpdir(), "rl-gemma-"));
  const claude = fs.mkdtempSync(path.join(os.tmpdir(), "rl-claude-"));
  // Gemma = template de démo nu
  mk(gemma, "src/App.jsx", "export default function App(){return <div>Demo template</div>}");
  mk(gemma, "package.json", '{"name":"x"}');
  // Claude = App complétée + un hook + un util (la vraie logique)
  mk(claude, "src/App.jsx", "import {useDecks} from './hooks/useDecks';\nexport default function App(){const d=useDecks();return <div>{d.length} decks</div>}");
  mk(claude, "src/hooks/useDecks.js", "export function useDecks(){return JSON.parse(localStorage.getItem('decks')||'[]')}");
  mk(claude, "src/utils/spacing.js", "export const next=(easy)=>Date.now()+(easy?4:1)*86400000");
  mk(claude, "package.json", '{"name":"x"}');

  // 1. computeDiff
  const changes = computeDiff(gemma, claude);
  const paths = changes.map((c) => c.path);
  check("App.jsx détecté comme modifié", changes.some((c) => c.path === "src/App.jsx" && c.status === "modified"));
  check("hook ajouté détecté", changes.some((c) => c.path === "src/hooks/useDecks.js" && c.status === "added"));
  check("util ajouté détecté", changes.some((c) => c.path === "src/utils/spacing.js" && c.status === "added"));
  check("package.json inchangé exclu", !paths.includes("package.json"));
  check("logique (hooks/utils) priorisée en tête", /hooks|utils/.test(changes[0].path));

  // 2. diffToText
  const txt = diffToText(changes);
  check("diffToText mentionne le hook", txt.includes("useDecks.js"));
  check("diffToText inclut du contenu", txt.includes("localStorage"));

  // 3. parseProcedureJson
  check("parse JSON nu", parseProcedureJson('{"name":"A","problem":"p","tags":["x"],"body":"B"}')?.name === "A");
  check("parse JSON en bloc ```json", parseProcedureJson('```json\n{"name":"A","body":"B"}\n```')?.body === "B");
  check("parse refuse sans name/body", parseProcedureJson('{"tags":["x"]}') === null);
  check("parse refuse le non-JSON", parseProcedureJson("désolé je ne peux pas") === null);

  // 4. learnFromSolution (faux expert) → procédure persistée
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), "rl-ws-"));
  const fakeDeps: ReverseLearnDeps = {
    ask: async () => JSON.stringify({
      name: "App CRUD persistée en localStorage",
      problem: "construire une app avec CRUD et persistance locale (decks, cartes, flashcards)",
      tags: ["crud", "localStorage", "hooks"],
      body: "## Situation\n...\n## Démarche\n1. hook useX\n## Pièges\nne jamais livrer le template\n## Validation\nrefresh garde les données",
    }),
  };
  const res = await learnFromSolution({ workspaceDir: ws, task: "app flashcards localStorage", gemmaDir: gemma, claudeDir: claude, nowIso: "2026-06-19T00:00:00Z" }, fakeDeps);
  check("learnFromSolution ok", res.ok === true && !!res.slug);
  const list = listProcedures(ws);
  check("procédure listée", list.length === 1 && list[0].name.includes("CRUD"));
  const entry = res.slug ? loadProcedure(ws, res.slug) : null;
  check("PROCEDURE.md contient la démarche", !!entry && entry.body.includes("Démarche"));
  check("tags persistés", !!entry && entry.meta.tags.includes("localStorage"));

  // 5. diff vide → échec propre
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), "rl-empty-"));
  mk(empty, "src/App.jsx", "export default function App(){return <div>Demo template</div>}"); // identique à gemma
  const res2 = await learnFromSolution({ workspaceDir: ws, task: "t", gemmaDir: gemma, claudeDir: empty, nowIso: "2026-06-19T00:00:00Z" }, fakeDeps);
  check("diff vide → ok:false sans crash", res2.ok === false);

  // Cleanup
  for (const d of [gemma, claude, ws, empty]) fs.rmSync(d, { recursive: true, force: true });

  console.log("═".repeat(64));
  if (failures === 0) { console.log("✅ reverse-learn PROUVÉ (diff, parse, distillation, persistance)."); process.exit(0); }
  else { console.log(`❌ ${failures} échec(s).`); process.exit(1); }
}

main().catch((e) => { console.error("❌", e instanceof Error ? e.stack : e); process.exit(1); });
