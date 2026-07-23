// Tests Phase 0 du Stratège (#164) — le diagnostic déterministe nomme correctement
// les blocages RÉELS rencontrés. 100 % pur (aucun modèle, aucun réseau).
import { diagnose, missingModuleName, localImportMismatch, shouldStopRetrying, REMEDY_BY_CLASS, type BlockerSymptoms } from "../stratege/stratege-signals.js";

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
  check("… remède = cerveau Stratège local", /qwythos-tools:q6/.test(d.remedy));
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

// ── repetitive-failure (#168 tranche 3 : réécriture en boucle sur build cassé) ─
{
  const loop = diagnose({ buildOk: false, finished: false, stuck: false, iterations: 14, buildDetail: "SyntaxError: Unexpected token '<'", toolNames: ["edit_file", "edit_file", "write_file", "edit_file", "edit_file"] });
  check("5 réécritures + build cassé sans cause reconnue → repetitive-failure", loop.blocker === "repetitive-failure");
  check("… preuve cite le nombre d'écritures", /5 écriture/.test(loop.evidence));
  const few = diagnose({ buildOk: false, finished: false, stuck: false, iterations: 6, buildDetail: "SyntaxError: Unexpected token", toolNames: ["edit_file", "edit_file"] });
  check("… sous le seuil → reste ambiguous (pas de faux positif)", few.blocker === "ambiguous");
  const dep = diagnose({ buildOk: false, finished: false, stuck: false, iterations: 14, buildDetail: `Cannot find module 'leaflet'`, toolNames: ["edit_file", "edit_file", "write_file", "edit_file", "edit_file"] });
  check("… missing-dependency garde la priorité malgré 5 écritures", dep.blocker === "missing-dependency");
  const wt = diagnose({ buildOk: false, finished: false, stuck: false, iterations: 14, buildDetail: "boom", toolNames: ["run_command", "run_command", "run_command", "edit_file", "edit_file", "write_file", "edit_file", "edit_file"] });
  check("… wrong-tool garde la priorité (run_command en rafale)", wt.blocker === "wrong-tool");
}

// ── local-import-mismatch (2026-07-14) — cas RÉELS orbital-control (2 échecs consécutifs) ─
{
  // Cas 1, vécu la veille : import d'un fichier local inexistant.
  const css = localImportMismatch(`Could not resolve "./SatelliteDetail.css" from "src/components/SatelliteDetail.jsx"`);
  check("import CSS local introuvable → kind unresolved", css?.kind === "unresolved");
  check("… cible extraite", css?.target === "./SatelliteDetail.css");
  check("… fichier importeur extrait", css?.importer === "src/components/SatelliteDetail.jsx");

  // Cas 2, vécu ce soir : export manquant dans un fichier local.
  const exp = localImportMismatch(`"getFilteredAndSortedSatellites" is not exported by "src/data/satellites.js", imported by "src/App.jsx".`);
  check("export local manquant → kind missing-export", exp?.kind === "missing-export");
  check("… symbole extrait", exp?.symbol === "getFilteredAndSortedSatellites");
  check("… fichier cible extrait", exp?.target === "src/data/satellites.js");
  check("… fichier importeur extrait", exp?.importer === "src/App.jsx");

  // Non-régression : une erreur de PAQUET npm (relative-path exclu) reste hors de ce détecteur.
  check("dépendance npm ('react-router-dom') non capturée ici", localImportMismatch(`Failed to resolve import "react-router-dom" from "src/App.jsx"`) === null);
  check("texte sans rapport → null", localImportMismatch("SyntaxError: Unexpected token") === null);

  // Câblage dans diagnose() — priorité juste après missing-dependency.
  const dCss = diagnose({ ...ok, buildOk: false, finished: false, buildDetail: `Could not resolve "./SatelliteDetail.css" from "src/components/SatelliteDetail.jsx"` });
  check("diagnose() → local-import-mismatch (fichier introuvable)", dCss.blocker === "local-import-mismatch");
  check("… cause nomme le fichier ET la cible", dCss.cause.includes("SatelliteDetail.jsx") && dCss.cause.includes("./SatelliteDetail.css"));
  check("… detail = la cible (pour usage futur)", dCss.detail === "./SatelliteDetail.css");

  const dExp = diagnose({ ...ok, buildOk: false, finished: false, buildDetail: `"getFilteredAndSortedSatellites" is not exported by "src/data/satellites.js", imported by "src/App.jsx".` });
  check("diagnose() → local-import-mismatch (export manquant)", dExp.blocker === "local-import-mismatch");
  check("… cause nomme le symbole ET les 2 fichiers", dExp.cause.includes("getFilteredAndSortedSatellites") && dExp.cause.includes("src/data/satellites.js") && dExp.cause.includes("src/App.jsx"));

  // missing-dependency garde la priorité (paquet npm, pas un bug de cohérence locale).
  const dPkg = diagnose({ ...ok, buildOk: false, finished: false, buildDetail: `Cannot find module 'leaflet'` });
  check("missing-dependency garde la priorité sur local-import-mismatch", dPkg.blocker === "missing-dependency");
}

// ── shouldStopRetrying (#196 partie C — règle des 3 essais) ─────────────────
check("0 répétition → ne pas arrêter", shouldStopRetrying(0) === false);
check("1 répétition → ne pas arrêter", shouldStopRetrying(1) === false);
check("2 répétitions → ne pas arrêter (pas encore 3)", shouldStopRetrying(2) === false);
check("3 répétitions consécutives → arrêter", shouldStopRetrying(3) === true);
check("au-delà de 3 → toujours arrêter", shouldStopRetrying(5) === true);
check("seuil personnalisé respecté (2)", shouldStopRetrying(2, 2) === true);
check("seuil personnalisé respecté (1 < 2)", shouldStopRetrying(1, 2) === false);

console.log(`\n${fail === 0 ? "✅" : "❌"} stratege-signals : ${pass} pass, ${fail} fail`);
if (fail > 0) process.exit(1);
