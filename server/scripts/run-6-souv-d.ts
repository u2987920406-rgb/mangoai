// SOUV-D — 5 apps pour remplir la fenêtre d'observation à 3 jours (2026-07-15),
// calqué sur run-3-complex-apps.ts (patron éprouvé sur caravan/strata la nuit
// précédente) : createProject → moodboard Sharingan ($0) → runRelay (pipeline
// RÉEL de l'Élève, PAS mocké) → commit → MangoQA (emitPhaseComplete +
// waitForVerdict) → snap → juge goût. AUCUNE intervention en cas d'échec : le
// script continue seul, on n'observe et ne note QUE ce que le pipeline fait
// de lui-même — c'est tout le point de SOUV-D (mesurer si le pipeline se
// débrouille seul, sans filet Claude actionné en pratique).
//
// Diversité voulue pour les seuils du protocole SOUV-D (5 types de projets,
// 2 cerveaux Élève testés en //) : chaque spec porte son propre `eleveModel`
// (override PAR APPEL via RelayOptions.eleveModel, cf. relay-config.ts:50 —
// AUCUNE modification de brain-registry.json, qui reste partagé avec la
// session automatique de Raf en parallèle sur la même machine).
//
// ELEVE_ESCALATE_ON_BLOCK reste tel que défini dans .env (actuellement "on")
// — le filet Claude n'est PAS désactivé de force, il reste le garde-fou par
// conception ; SOUV-D mesure justement s'il s'arme peu/pas en pratique
// (seuil 2 du protocole, cf. historique.md Journal 2026-07-15).
//
// Lancer :   npx tsx scripts/run-6-souv-d.ts
// Reprendre : même commande (resumable via .run-6-souv-d.state.json).

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { atomicWriteFileSync } from "../src/safe-io.js";
import { createProject, projectDir, projectExists, WORKSPACE_DIR } from "../src/projects.js";
import { runRelay, defaultRelayDeps } from "../src/eleve.js";
import { judgeProject } from "../src/nocturnal.js";
import { sharinganAnalyze, capturePreview, type SharinganResult } from "../src/vision.js";
import { commitVersion, changedFilesInLastCommit } from "../src/versions.js";
import { isMangoQaActive, emitPhaseComplete, waitForVerdict } from "../src/mangoqa.js";
import { flag } from "../src/flags.js";
import { runAsActor } from "../src/perimeter-context.js";

const STATE_FILE = path.join(WORKSPACE_DIR, ".run-6-souv-d.state.json");
const LOG_FILE = path.join(WORKSPACE_DIR, ".run-6-souv-d.log");
const RESULTS_FILE = path.join(WORKSPACE_DIR, ".run-6-souv-d.results.json");
const BILAN_FILE = path.join(WORKSPACE_DIR, ".run-6-souv-d.bilan.md");
const SHOTS_DIR = path.join(WORKSPACE_DIR, ".run-6-souv-d-shots");

function log(msg: string): void {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(LOG_FILE, line + "\n"); } catch { /* ignore */ }
}

// ── Les 5 specs (briefs cristallisés — angle clair dès le départ, pas de
// concept flou volontaire : SOUV-D teste l'EXÉCUTION, pas la résistance à un
// brief pauvre). Discipline COMMON reprise telle quelle de run-3-complex-apps
// (éprouvée sur abyss 5/5, caravan, strata). ──────────────────────────────

interface AppSpec {
  name: string;
  template: string;
  port: number;
  leaders: string[];
  eleveModel: string;
  task: string;
}

const COMMON =
  `\n\n## RÈGLES DE PRODUCTION (non négociables)\n` +
  `1. VRAIES IMAGES : utilise l'outil chercher_image (Pexels) pour CHAQUE visuel réel ` +
  `(héros, galeries, vignettes). Décris des requêtes précises en anglais. ` +
  `INTERDIT : genere_image / Flux / placeholders gris.\n` +
  `2. CONTEXTE D'ABORD : commence par cerner l'identité du sujet (chercher_web si utile), ` +
  `puis conçois autour de cette identité réelle.\n` +
  `3. PLANIFIE BRIÈVEMENT (outil planifier, 3-5 étapes MAX), puis ÉCRIS tout de suite le fichier ` +
  `principal — ne passe pas plus de 2-3 appels d'outils à explorer/lire avant d'écrire une première version.\n` +
  `4. EFFET WAHOU maîtrisé : animations à l'entrée, transitions fluides, hover riches — mais lisibilité et perf priment.\n` +
  `5. FONCTIONNEL : CHAQUE fonction listée doit RÉELLEMENT être écrite et marcher (clics, filtres, calculs, persistance localStorage) — ` +
  `ne laisse JAMAIS le template de départ intact, un projet qui compile sans rien faire de la tâche demandée est un ÉCHEC. ` +
  `Vérifie avec teste_parcours quand c'est pertinent.\n` +
  `6. Le BUILD doit passer (check_build). Composants < 200 lignes, hooks séparés, responsive mobile→desktop.\n` +
  `7. NE T'ÉTERNISE PAS EN EXPLORATION : une V1 fonctionnelle du fichier principal écrite tôt vaut mieux ` +
  `qu'un plan parfait jamais exécuté. Si tu relis/modifies le CSS ou fais des vérifications, fais-le APRÈS ` +
  `avoir écrit la logique principale, jamais avant.\n` +
  `\nSession AUTONOME : prends toutes les décisions toi-même. Ne demande rien, livre.`;

const SPECS: AppSpec[] = [
  {
    name: "brasero",
    template: "vitrine",
    port: 5241,
    leaders: ["https://www.bluebottlecoffee.com"],
    eleveModel: "glm-5.2:cloud",
    task:
      "Crée **BRASERO**, la vitrine d'un torréfacteur de café artisanal (React + Tailwind v4). " +
      "CONCEPT FORT : la CHALEUR et la FUMÉE de la torréfaction comme fil conducteur visuel — teintes " +
      "braise/ambre/fumée, transitions qui évoquent la montée en température, jamais un site café générique " +
      "pastel. SECTIONS : (1) Hero avec l'instant de la torréfaction. (2) Les origines — 4-6 cafés d'origine " +
      "différente (pays, altitude, notes de dégustation, VRAIES photos Pexels de grains/plantations). " +
      "(3) Le processus de torréfaction expliqué en étapes visuelles (courbe de température illustrée). " +
      "(4) Boutique — grille de produits avec filtre par intensité/origine, ajout panier fonctionnel " +
      "(état réel, compteur qui change). (5) Contact/atelier. " +
      "EXIGENCE : chaque filtre doit RÉELLEMENT changer l'affichage — vérifie toi-même." + COMMON,
  },
  {
    name: "derive",
    template: "motion",
    port: 5242,
    leaders: ["https://www.gog.com"],
    eleveModel: "qwen3.5:cloud",
    task:
      "Crée **DÉRIVE**, un jeu de survie en mer sur un radeau de fortune, tour par tour (React + Tailwind v4 " +
      "+ framer-motion). LOGIQUE DE JEU RÉELLE (état en mémoire, calculs corrects) : " +
      "— 3 jauges qui baissent CHAQUE tour : eau, nourriture, moral — si une tombe à 0, conséquence réelle " +
      "(pénalité ou fin de partie). " +
      "— Inventaire d'objets récupérés (bidon d'eau, canne à pêche, carte, fusée de détresse) utilisables " +
      "pour restaurer une jauge ou débloquer un choix. " +
      "— À chaque tour, un ÉVÉNEMENT ALÉATOIRE (tempête, épave à explorer, autre navire au loin, banc de " +
      "poissons) avec 2-3 CHOIX dont les conséquences affectent VRAIMENT les jauges/l'inventaire. " +
      "— Compteur de jours en mer, condition de VICTOIRE (repérer la côte après un nombre de jours) et de " +
      "DÉFAITE (jauge clé à 0), écran de fin réel. " +
      "EXIGENCE : joue-toi-même une partie mentalement pour vérifier chaque mécanique avant de terminer. " +
      "Ambiance mer hostile mais pas désespérée (bleus profonds, touches de corde/bois flotté)." + COMMON,
  },
  {
    name: "cadence",
    template: "charts",
    port: 5243,
    leaders: ["https://www.strava.com"],
    eleveModel: "qwen3.5:cloud",
    task:
      "Crée **CADENCE**, un simulateur de fréquence cardiaque à l'effort (React + Tailwind v4). " +
      "CONCEPT : l'utilisateur règle une allure (min/km, curseur) et un dénivelé (%, curseur), et voit en TEMPS " +
      "RÉEL (graphique qui s'anime, pas statique) une courbe de fréquence cardiaque simulée qui réagit selon " +
      "un modèle physiologique plausible (FC monte avec l'allure ET le dénivelé, plafonne, redescend si l'effort " +
      "baisse) — CALCUL RÉEL en JS, pas une valeur bidon. Affiche zones d'effort (récupération/aérobie/seuil/" +
      "anaérobie) colorées, un historique de la session (mini-graphique des dernières minutes), et un résumé " +
      "(FC moyenne, temps passé par zone). " +
      "EXIGENCE : fais varier les curseurs toi-même mentalement et vérifie que la courbe réagit de façon " +
      "cohérente (allure plus rapide → FC plus haute, jamais l'inverse). Palette sport/données, dense mais lisible." + COMMON,
  },
  {
    name: "veilleur",
    template: "dashboard",
    port: 5244,
    leaders: ["https://www.notion.so"],
    eleveModel: "glm-5.2:cloud",
    task:
      "Crée **VEILLEUR**, un tracker d'habitudes minimaliste (React + Tailwind v4). CONCEPT : la RETENUE comme " +
      "argument — pas de gamification criarde (pas de confettis, pas de badges XP), juste une série de stries " +
      "(streak) sobre et un sentiment de continuité. FONCTIONS RÉELLES : ajouter/supprimer une habitude, cocher " +
      "le jour présent (persistance localStorage réelle), voir la série en cours et le record, une grille type " +
      "\"contribution graph\" des 90 derniers jours par habitude, un mini-résumé hebdomadaire honnête (pas de " +
      "score inventé). " +
      "EXIGENCE : recharge mentale la page — les données doivent survivre (localStorage), pas de faux état. " +
      "Palette neutre et calme (pas de couleurs saturées), typographie soignée, beaucoup d'espace blanc." + COMMON,
  },
  {
    name: "lueur",
    template: "vitrine",
    port: 5245,
    leaders: ["https://www.apple.com/airpods-pro/"],
    eleveModel: "qwen3.5:cloud",
    task:
      "Crée **LUEUR**, un site immersif sur la vie d'un gardien de phare (React + Tailwind v4). CONCEPT FORT : " +
      "le SCROLL fait avancer le CYCLE JOUR/NUIT — la palette et la lumière ambiante de la page changent " +
      "progressivement du matin (bleus clairs) au crépuscule (orange/violet) puis à la nuit (bleu marine/faisceau " +
      "du phare qui tourne, animé) au fil du scroll — pas un simple fondu cosmétique, ça doit se SENTIR. " +
      "CONTENU : un carnet de bord du gardien — sections courtes correspondant à des moments de la journée " +
      "(lever, entretien de la lentille, tempête, veille nocturne), VRAIES photos Pexels de phares/mer/côtes. " +
      "Un \"carnet\" interactif où l'utilisateur peut ajouter sa propre note pour le jour courant (persistance " +
      "localStorage). " +
      "EXIGENCE : vérifie que la transition jour/nuit reste cohérente sur TOUTE la page, pas juste le hero. " +
      "Lisibilité du texte garantie même sur le fond nocturne le plus sombre." + COMMON,
  },
];

// ── Snapshot best-effort (calqué run-mango-nuit.ts / run-3-complex-apps.ts) ──

function spawnDev(dir: string, port: number): ChildProcess {
  const isWin = process.platform === "win32";
  return spawn(isWin ? "npm.cmd" : "npm", ["run", "dev", "--", "--port", String(port), "--strictPort"], {
    cwd: dir, shell: isWin, windowsHide: true, stdio: "ignore",
  });
}
function killTree(child: ChildProcess): void {
  if (!child.pid) return;
  if (process.platform === "win32") {
    try { spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true }); } catch { /* */ }
  } else {
    try { child.kill("SIGKILL"); } catch { /* */ }
  }
}
async function waitForServer(url: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { if ((await fetch(url)).ok) return true; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 700));
  }
  return false;
}
async function snap(dir: string, port: number, label: string): Promise<string | undefined> {
  let child: ChildProcess | undefined;
  try {
    fs.mkdirSync(SHOTS_DIR, { recursive: true });
    child = spawnDev(dir, port);
    const url = `http://localhost:${port}`;
    if (!(await waitForServer(url, 45_000))) { log(`  · snap ${label} : preview non démarrée (skip)`); return undefined; }
    await new Promise((r) => setTimeout(r, 1800));
    const buf = await capturePreview(url);
    const file = path.join(SHOTS_DIR, `${label}.jpg`);
    fs.writeFileSync(file, buf);
    log(`  · snap ${label} : ${Math.round(buf.length / 1024)} Ko`);
    return file;
  } catch (e) {
    log(`  · snap ${label} : échec best-effort (${(e as Error).message})`);
    return undefined;
  } finally {
    if (child) killTree(child);
    await new Promise((r) => setTimeout(r, 900));
  }
}

async function buildMoodboard(leaders: string[]): Promise<{ block: string; palette: string[] }> {
  if (!leaders.length) return { block: "", palette: [] };
  const blocks: string[] = [];
  const allPalette: string[] = [];
  for (const url of leaders) {
    try {
      log(`  🔮 Sharingan ($0) sur ${url}…`);
      const r: SharinganResult = await sharinganAnalyze(url);
      allPalette.push(...r.palette);
      const fonts = r.fonts.length ? r.fonts.slice(0, 3) : r.typography.families.slice(0, 3);
      blocks.push(`• ${url}\n  Palette : ${r.palette.slice(0, 6).join(", ") || "(n/a)"}\n  Fonts : ${fonts.join(", ") || "(système)"}`);
    } catch (e) {
      log(`  ⚠ Sharingan ${url} : ${(e as Error).message} (on continue)`);
    }
  }
  if (!blocks.length) return { block: "", palette: [] };
  const palette = [...new Set(allPalette)].slice(0, 8);
  const block = `\n\n## MOODBOARD — charte extraite de leaders réels (Sharingan, $0)\n${blocks.join("\n")}\n\n` +
    `Inspire-toi de l'AMBIANCE et de la hiérarchie visuelle de ces références (sans copier). Définis tes couleurs en variables CSS :root.`;
  return { block, palette };
}

// ── État / résultats ─────────────────────────────────────────────────────────

interface State { done: string[] }
function loadState(): State {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, "utf8")) as State; } catch { return { done: [] }; }
}
function saveState(s: State): void { atomicWriteFileSync(STATE_FILE, JSON.stringify(s, null, 2)); }
function markDone(s: State, id: string): void { if (!s.done.includes(id)) s.done.push(id); saveState(s); }

interface ProjectResult {
  name: string;
  eleveModel: string;
  buildOk: boolean;
  resolvedBy: string;
  attempts: number;
  incomplete: boolean;
  costUsd: number;
  durationMs: number;
  paletteInjected: string[];
  changedFiles: number;
  mangoqa: { checked: boolean; verdict?: "green" | "red"; note?: string };
  score?: number;
  judgeComment?: string;
  shotAfter?: string;
  error?: string;
  buildSignal?: string;
}

// ── Un projet ─────────────────────────────────────────────────────────────────

async function runProject(spec: AppSpec, state: State): Promise<ProjectResult | null> {
  if (state.done.includes(`done-${spec.name}`)) { log(`⏭  ${spec.name} déjà fait.`); return null; }
  const started = Date.now();
  const dir = projectDir(spec.name);
  log(`\n═══════════════════════════════════════════════════════════════`);
  log(`▶ ${spec.name} (Élève : ${spec.eleveModel})`);

  if (!projectExists(spec.name)) {
    try {
      await createProject(spec.name, spec.template);
      log(`  ✓ projet créé (${spec.template})`);
    } catch (e) {
      const error = `createProject: ${(e as Error).message}`;
      log(`  ✗ ${error}`);
      return { name: spec.name, eleveModel: spec.eleveModel, buildOk: false, resolvedBy: "none", attempts: 0, incomplete: false, costUsd: 0, durationMs: Date.now() - started, paletteInjected: [], changedFiles: 0, mangoqa: { checked: false }, error };
    }
  } else {
    log(`  · projet déjà existant — reprise`);
  }

  const { block, palette } = await buildMoodboard(spec.leaders);
  const fullTask = spec.task + block;

  let buildOk = false, resolvedBy = "none", attempts = 0, costUsd = 0, incomplete = false, buildSignal: string | undefined;
  let error: string | undefined;
  try {
    // eleveModel : override PAR APPEL (relay-config.ts:50), aucune modification de
    // brain-registry.json. ELEVE_ESCALATE_ON_BLOCK reste tel que .env (filet Claude
    // par conception, on mesure s'il s'arme — pas désactivé de force ici).
    const r = await runRelay(
      fullTask,
      dir,
      {
        eleveModel: spec.eleveModel,
        maitreModel: "sonnet",
        onLog: (l) => log(`    [relay] ${l}`),
        functionalGate: true,
        functionalMin: 5,
      },
      {
        ...defaultRelayDeps,
        judge: async (projDir, task) => {
          const j = await judgeProject(projDir, task);
          return j ? { fonctionnel: j.dims.fonctionnel, note: j.comment } : null;
        },
      },
    );
    buildOk = r.success;
    resolvedBy = r.resolvedBy;
    attempts = r.attempts;
    costUsd = r.costUsd;
    incomplete = !!r.incomplete;
    buildSignal = r.inspection.signal;
    if (r.success) log(`  ✓ build OK — ${r.resolvedBy} en ${r.attempts} tentative(s), coût $${costUsd.toFixed(4)}${incomplete ? " (INCOMPLET — pas de finish)" : ""}`);
    else { error = r.inspection.detail.slice(-300); log(`  ✗ build KO (${r.inspection.signal}) — ${error}`); }
  } catch (e) {
    error = `runRelay: ${(e as Error).message}`;
    log(`  ✗ ${error}`);
  }

  const mangoqa: ProjectResult["mangoqa"] = { checked: false };
  let changedFiles = 0;
  if (buildOk) {
    try {
      const version = await commitVersion(dir, `run-6-souv-d : ${spec.name}`);
      const files = version ? await changedFilesInLastCommit(dir) : [];
      changedFiles = files.length;
      if (isMangoQaActive()) {
        emitPhaseComplete(spec.name, "final", files);
        log(`  🛡️ MangoQA — signal émis, attente du verdict (jusqu'à 300s)…`);
        const verdict = await waitForVerdict(spec.name, 300_000);
        if (verdict) {
          mangoqa.checked = true;
          mangoqa.verdict = verdict.verdict;
          mangoqa.note = verdict.rejection?.corrective_action;
          log(`  🛡️ MangoQA verdict : ${verdict.verdict.toUpperCase()}${verdict.rejection ? ` — ${verdict.rejection.corrective_action}` : ""}`);
        } else {
          log(`  ⚠ MangoQA : pas de verdict reçu dans le délai (300s)`);
        }
      } else {
        log(`  ⚠ MangoQA inactif (sentinelle absente/périmée) — non vérifié`);
      }
    } catch (e) {
      log(`  ⚠ MangoQA indisponible : ${(e as Error).message}`);
    }
  }

  const shotAfter = buildOk ? await snap(dir, spec.port, `${spec.name}-apres`) : undefined;
  let score: number | undefined, judgeComment: string | undefined;
  if (buildOk) {
    try {
      const j = await judgeProject(dir, spec.task);
      if (j) { score = j.score; judgeComment = j.comment; log(`  🏆 ${j.score}/10 — « ${j.comment} »`); }
    } catch { log(`  ⚠ juge indisponible`); }
  }

  markDone(state, `done-${spec.name}`);
  return { name: spec.name, eleveModel: spec.eleveModel, buildOk, resolvedBy, attempts, incomplete, costUsd, durationMs: Date.now() - started, paletteInjected: palette, changedFiles, mangoqa, score, judgeComment, shotAfter, error, buildSignal };
}

// ── Bilan ─────────────────────────────────────────────────────────────────────

function writeBilan(results: ProjectResult[]): void {
  const now = new Date().toISOString();
  const L: string[] = [
    `# Bilan SOUV-D — 5 apps, pipeline Élève+MangoQA pur (2 cerveaux cloud), zéro intervention — ${now}`,
    "",
    "Objectif : remplir la fenêtre d'observation à 3 jours (seuils : clôture autonome, escalade Claude, qualité, diversité, stabilité).",
    "",
    "## Tableau",
    "",
    "| Projet | Élève | Build | Résolu par | Tentatives | Incomplet | MangoQA | Score goût | Coût | Durée |",
    "|--------|-------|-------|------------|------------|-----------|---------|------------|------|-------|",
  ];
  for (const r of results) {
    const qa = r.mangoqa.checked ? (r.mangoqa.verdict === "green" ? "🟢" : "🔴") : "—";
    L.push(`| ${r.name} | ${r.eleveModel} | ${r.buildOk ? "✅" : "❌"} | ${r.resolvedBy} | ${r.attempts} | ${r.incomplete ? "⚠ oui" : "non"} | ${qa} | ${r.score != null ? r.score + "/10" : "—"} | $${r.costUsd.toFixed(4)} | ${Math.round(r.durationMs / 60000)} min |`);
  }
  L.push("", "## Détail", "");
  for (const r of results) {
    L.push(`### ${r.name} (${r.eleveModel})`);
    if (r.paletteInjected.length) L.push(`- Palette moodboard : ${r.paletteInjected.join(", ")}`);
    L.push(`- Fichiers modifiés (dernier commit) : ${r.changedFiles}`);
    if (r.buildSignal) L.push(`- Signal build final : ${r.buildSignal}`);
    if (r.mangoqa.checked) L.push(`- MangoQA : ${r.mangoqa.verdict}${r.mangoqa.note ? ` — ${r.mangoqa.note}` : ""}`);
    if (r.shotAfter) L.push(`- Capture : \`${r.shotAfter}\``);
    if (r.judgeComment) L.push(`- Avis juge goût : ${r.judgeComment}`);
    if (r.error) L.push(`- ⚠ Erreur : ${r.error}`);
    L.push("");
  }
  const ok = results.filter((r) => r.buildOk).length;
  const escalades = results.filter((r) => r.resolvedBy === "maitre").length;
  const totalCost = results.reduce((s, r) => s + r.costUsd, 0);
  L.push(
    "## Résumé",
    "",
    `- Builds OK : **${ok}/${results.length}**`,
    `- Escalades filet Claude (resolvedBy=maitre) : **${escalades}/${results.length}** — devrait rester proche de 0 (SOUV-D seuil 2)`,
    `- Coût total (Ollama Cloud, doit être ≈$0 côté Claude) : **$${totalCost.toFixed(4)}**`,
    `- Captures : \`${SHOTS_DIR}\``,
  );
  fs.writeFileSync(BILAN_FILE, L.join("\n") + "\n");
  log(`\n📋 Bilan : ${BILAN_FILE}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  if (!flag("ELEVE_CLOSURE_GATE")) {
    console.warn("[gardien] ⚠ ELEVE_CLOSURE_GATE est OFF — le Gardien natif (intention+goût) ne s'exécutera pas ; ce script ajoute quand même le check MangoQA lui-même après chaque build.");
  }
  log("\n🌙 ═══════════════════════════════════════════════════════════════");
  log(`   SOUV-D — 5 apps, pipeline Élève+MangoQA pur, zéro intervention`);
  log(`   ELEVE_ESCALATE_ON_BLOCK=${process.env.ELEVE_ESCALATE_ON_BLOCK ?? "(non défini = OFF)"} (filet — mesuré, pas désactivé)`);
  log("═══════════════════════════════════════════════════════════════════\n");

  const ollamaOk = await fetch(`${process.env.OLLAMA_URL ?? "http://localhost:11434"}/api/tags`).then((r) => r.ok).catch(() => false);
  log(ollamaOk ? "✓ Ollama :11434 OK" : "⚠ Ollama injoignable — arrêt");
  if (!ollamaOk) process.exit(1);
  log(isMangoQaActive() ? "✓ MangoQA actif (sentinelle vivante)" : "⚠ MangoQA INACTIF — les builds ne seront pas audités");

  const state = loadState();
  const results: ProjectResult[] = [];
  for (const spec of SPECS) {
    try {
      const r = await runProject(spec, state);
      if (r) {
        results.push(r);
        atomicWriteFileSync(RESULTS_FILE, JSON.stringify(results, null, 2));
        writeBilan(results);
      }
    } catch (e) {
      log(`✗ ${spec.name} exception : ${(e as Error).stack ?? e}`);
    }
  }
  writeBilan(results);
  const ok = results.filter((r) => r.buildOk).length;
  log("\n🌅 ═══════════════════════════════════════════════════════════════");
  log(`   TERMINÉ — Builds OK : ${ok}/${results.length} · Bilan : ${BILAN_FILE}`);
  log("═══════════════════════════════════════════════════════════════════");
}

runAsActor("autonomous", main).catch((e) => {
  console.error("❌", e instanceof Error ? e.stack : e);
  process.exit(1);
});
