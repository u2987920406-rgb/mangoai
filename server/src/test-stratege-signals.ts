// Tests Phase 0 du Stratège (#164) — le diagnostic déterministe nomme correctement
// les blocages RÉELS rencontrés. 100 % pur (aucun modèle, aucun réseau).
import { diagnose, missingModuleName, REMEDY_BY_CLASS, type BlockerSymptoms } from "./stratege-signals.js";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean) {
  if (cond) { pass++; } else { fail++; console.error(`  ❌ ${label}`); }
}

// base « tout va bien » qu'on perturbe cas par cas
const ok: BlockerSymptoms = { buildOk: true, finished: true, stuck: false, iterations: 12, toolNames: ["write_file", "check_build", "finish"] };

// ── missingModuleName (extracteur) ───────────────────────────────────────────
check("module Vite : Failed to resolve import", missingModuleName(`Failed to resolve import "react-router-dom" from "src/App.jsx"`) === "react-router-dom");
check("module Node : Cannot find module", missingModuleName(`Error: Cannot find module 'framer-motion'`) === "framer-motion");
check("module scoped @scope/pkg", missingModuleName(`Could not resolve "@tanstack/react-query"`) === "@tanstack/react-query");
check("sous-chemin réduit au package", missingModuleName(`Cannot find module 'date-fns/format'`) === "date-fns");
check("import RELATIF cassé ≠ dépendance (vrai bug code)", missingModuleName(`Failed to resolve import "./Missing.jsx"`) === null);

// ── none ─────────────────────────────────────────────────────────────────────
check("build vert + finish → none", diagnose(ok).blocker === "none");
check("none → formatDiagnosis vide", REMEDY_BY_CLASS["none"] === "—");

// ── missing-dependency (cas réel : mangoos-showcase aurait pu rater react-router) ─
{
  const d = diagnose({ ...ok, buildOk: false, finished: false, buildDetail: `Failed to resolve import "react-router-dom" from "src/main.jsx"` });
  check("dépendance manquante → missing-dependency", d.blocker === "missing-dependency");
  check("… module extrait", d.detail === "react-router-dom");
  check("… remède = add_dependency paramétré", d.remedy === "add_dependency('react-router-dom')");
}

// ── knowledge-gap (usage d'API erroné, sans chercher_web) ────────────────────
{
  const d = diagnose({ buildOk: false, finished: false, stuck: false, iterations: 8, task: "ajoute un graphe avec recharts", buildDetail: "TypeError: ResponsiveContainer is not a function", toolNames: ["read_file", "edit_file", "check_build"] });
  check("erreur d'usage + pas de chercher_web → knowledge-gap", d.blocker === "knowledge-gap");
  const d2 = diagnose({ buildOk: false, finished: false, stuck: false, iterations: 8, task: "ajoute un graphe", buildDetail: "TypeError: X is not a function", toolNames: ["chercher_web", "edit_file"] });
  check("… mais s'il S'EST documenté → pas knowledge-gap", d2.blocker !== "knowledge-gap");
}

// ── wrong-tool (tâtonnement shell pour lire — piège Windows) ─────────────────
{
  const d = diagnose({ buildOk: false, finished: false, stuck: false, iterations: 6, buildDetail: "syntax error", toolNames: ["run_command", "run_command", "run_command", "read_file"] });
  check("run_command en rafale → wrong-tool", d.blocker === "wrong-tool");
}

// ── flaky-resource (cas RÉEL : image Pexels morte de maison-terroir) ──────────
{
  const d = diagnose({ ...ok, deadImages: 1 });
  check("image morte non réparable → flaky-resource", d.blocker === "flaky-resource");
  check("… build vert n'efface pas le blocage ressource", diagnose({ ...ok, finished: true, deadImages: 2 }).blocker === "flaky-resource");
}

// ── wandering (cas RÉEL : tide-surf / dressing-lia bloqués en sur-exploration) ─
{
  const d = diagnose({ buildOk: true, finished: false, stuck: true, iterations: 7, toolNames: ["write_file", "write_file", "read_file", "read_file", "read_file"] });
  check("build vert + stuck + a écrit → wandering", d.blocker === "wandering");
  check("… cause mentionne le 'finish' manquant", /finish/i.test(d.cause));
  const d2 = diagnose({ buildOk: true, finished: false, stuck: true, iterations: 7, toolNames: ["search_code", "search_code", "list_files"] });
  check("… explore sans écrire → wandering aussi", d2.blocker === "wandering");
}

// ── plateau-iterations (plafond sans finir, sans stuck) ──────────────────────
{
  const d = diagnose({ buildOk: true, finished: false, stuck: false, iterations: 24, maxIterations: 24, toolNames: ["write_file", "edit_file"] });
  check("plafond atteint, pas stuck → plateau-iterations", d.blocker === "plateau-iterations");
  check("… preuve cite iterations/max", /24\/24/.test(d.evidence));
}

// ── ambiguous (build cassé sans motif reconnu → Phase 3 cerveau local) ───────
{
  const d = diagnose({ buildOk: false, finished: false, stuck: false, iterations: 5, buildDetail: "quelque chose d'inattendu sans signature connue", toolNames: ["edit_file"] });
  check("build cassé non reconnu → ambiguous", d.blocker === "ambiguous");
  check("… remède = cerveau Stratège local", /gemma4:12b/.test(d.remedy));
}

// ── traçabilité : chaque diagnostic porte une preuve non vide ────────────────
{
  const cases: BlockerSymptoms[] = [
    { ...ok, buildOk: false, buildDetail: `Cannot find module 'x'`, finished: false },
    { ...ok, deadImages: 1 },
    { buildOk: true, finished: false, stuck: true, iterations: 3, toolNames: ["read_file"] },
  ];
  check("tout diagnostic non-none a une evidence + un remède", cases.every((c) => { const d = diagnose(c); return d.evidence.length > 0 && d.remedy.length > 0; }));
}

console.log(`\n${fail === 0 ? "✅" : "❌"} stratege-signals : ${pass} pass, ${fail} fail`);
if (fail > 0) process.exit(1);
