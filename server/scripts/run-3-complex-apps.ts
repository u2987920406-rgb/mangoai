// Run "3 apps complexes, zéro intervention" (commande de Raf, 2026-07-13, nuit) —
// calqué sur run-mango-nuit.ts (patron éprouvé) : createProject → moodboard
// Sharingan ($0) → runRelay (pipeline RÉEL de l'Élève, PAS mocké) → commit →
// MangoQA (emitPhaseComplete + waitForVerdict, absent du script original — le
// chemin CONTRAT que suit Qwythos-9B, relay-contract.ts, n'a AUCUNE intégration
// MangoQA native, contrairement au moteur agentique — vérifié ce soir) → snap →
// juge goût. AUCUNE intervention en cas d'échec : le script continue seul, je
// n'observe et ne note QUE ce que le pipeline fait de lui-même.
//
// ELEVE_ESCALATE_ON_BLOCK reste NON défini (défaut OFF, recâblage souverain de
// ce soir) — zéro appel Claude furtif, test honnête du pipeline 100% Élève.
//
// Lancer :   npx tsx scripts/run-3-complex-apps.ts
// Reprendre : même commande (resumable via .run-3-complex.state.json).

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

const STATE_FILE = path.join(WORKSPACE_DIR, ".run-3-complex.state.json");
const LOG_FILE = path.join(WORKSPACE_DIR, ".run-3-complex.log");
const RESULTS_FILE = path.join(WORKSPACE_DIR, ".run-3-complex.results.json");
const BILAN_FILE = path.join(WORKSPACE_DIR, ".run-3-complex.bilan.md");
const SHOTS_DIR = path.join(WORKSPACE_DIR, ".run-3-complex-shots");

function log(msg: string): void {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(LOG_FILE, line + "\n"); } catch { /* ignore */ }
}

// ── Les 3 specs (prompts "parfaits", discipline COMMON éprouvée par abyss 5/5) ──

interface AppSpec {
  name: string;
  template: string;
  port: number;
  leaders: string[];
  task: string;
}

// (2026-07-14, corrigé une 2e fois) — Le 1er run (profil GENERIC/contrat, ancien tag
// Qwythos cassé) a produit un COMMON "chemin contrat only" (<write>/<edit>/<run>, sans
// outils). Depuis, ELEVE_MODEL a été retaggé "qwythos-tools:q6" (Modelfile réparé,
// tool-calling natif réel) : resolveProfile() route désormais ce script sur le moteur
// AGENTIQUE (relay-agentic.ts, outils réels chercher_image/planifier/teste_parcours/
// check_build), PAS le contrat. Rejouer avec l'ancien COMMON aurait activement menti
// au modèle ("pas d'outil disponible ici" alors qu'il y en a) — corrigé, on reprend le
// COMMON éprouvé (mango-nuit-specs.ts, abyss 5/5) adapté aux outils réels.
// Point 7 ajouté suite à L126 (limites.md, 2026-07-14) : sur la tâche "CARAVAN", ce
// même modèle a épuisé ses 10 auto-relances en exploration/planification sans jamais
// écrire le fichier principal — consigne explicite pour contrer ce mode d'échec précis.
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
    name: "orbital-control",
    template: "dashboard",
    port: 5231,
    leaders: ["https://linear.app", "https://stripe.com/dashboard"],
    task:
      "Crée **ORBITAL CONTROL**, un centre de contrôle pour une flotte de satellites fictive (React + Tailwind v4). " +
      "CONCEPT : une salle de contrôle spatiale RÉELLE — dense, précise, jamais illisible. " +
      "ÉCRANS : (1) Vue d'ensemble — carte orbitale stylisée (positions des satellites en orbite, style radar/plan), " +
      "état global de la flotte. (2) Liste des satellites — FILTRABLE (par statut : nominal/alerte/critique) et TRIABLE " +
      "(par batterie, altitude, nom) — génère 12-18 satellites fictifs avec des données plausibles (nom, statut, " +
      "batterie %, altitude km, dernière télémétrie). (3) Fiche détail d'un satellite — graphiques de télémétrie " +
      "(historique batterie/température simulé), historique d'alertes. (4) Flux d'alertes — liste d'alertes qui " +
      "s'accumule (nouvelles alertes simulées apparaissant au fil de l'usage, ex. via setInterval), sévérité visuelle claire. " +
      "(5) Recherche globale (par nom de satellite). " +
      "EXIGENCE : chaque filtre/tri/recherche doit RÉELLEMENT changer ce qui s'affiche — teste-le toi-même. " +
      "Palette sombre, précise, dense mais hiérarchisée (jamais un mur de texte)." + COMMON,
  },
  {
    name: "caravan",
    template: "motion",
    port: 5232,
    leaders: ["https://www.gog.com"],
    task:
      "Crée **CARAVAN**, un jeu de gestion d'une caravane marchande traversant un désert, tour par tour (React + " +
      "Tailwind v4 + framer-motion). LOGIQUE DE JEU RÉELLE (état en mémoire, calculs corrects — pas une maquette) : " +
      "— Inventaire de marchandises (épices, tissus, eau, outils...) avec quantités et prix qui VARIENT à chaque étape " +
      "(achat/vente réels, l'argent du joueur change réellement). " +
      "— Ressources consommées CHAQUE tour : eau, nourriture, endurance des bêtes (des jauges qui baissent réellement ; " +
      "si une ressource tombe à 0, conséquence réelle — pénalité ou défaite). " +
      "— Progression sur une carte en 8-12 étapes (visuelle, avec la position actuelle de la caravane). " +
      "— À chaque étape, un ÉVÉNEMENT ALÉATOIRE (tempête de sable, bandits, oasis, marchand rare) avec 2-3 CHOIX " +
      "réels dont les conséquences affectent VRAIMENT les ressources/l'inventaire (pas juste un texte qui ne change rien). " +
      "— Condition de VICTOIRE (atteindre la dernière étape avec la caravane en vie) et de DÉFAITE (une ressource clé " +
      "à 0), avec un écran de fin réel. " +
      "EXIGENCE : joue-toi-même une partie mentalement pour vérifier que chaque mécanique fonctionne avant de " +
      "considérer la tâche terminée. Ambiance désertique chaleureuse (ocre, terracotta, or), pas générique-fantasy." + COMMON,
  },
  {
    name: "strata",
    template: "vitrine",
    port: 5233,
    leaders: ["https://www.apple.com/airpods-pro/"],
    task:
      "Crée **STRATA**, un site immersif sur l'histoire profonde de la Terre (React + Tailwind v4). CONCEPT FORT, " +
      "jamais vu ici : le SCROLL fait REMONTER LE TEMPS GÉOLOGIQUE — un indicateur d'ère et de millions d'années " +
      "défile pendant le scroll, et CHAQUE ère traversée (en descendant : Holocène → Anthropocène, puis en remontant " +
      "le temps : Crétacé, Trias, Cambrien, Précambrien) a sa PROPRE palette et texture (couleurs de roches/fossiles/" +
      "paysages propres à cette période), avec une transition visuelle SENSIBLE entre chaque ère (pas juste un fondu " +
      "cosmétique — le changement doit se SENTIR : teinte dominante, texture de fond, ambiance). " +
      "CONTENU : une section par ère avec un texte court et factuellement crédible (recherche web si besoin) et de " +
      "VRAIES photos Pexels pertinentes (strates rocheuses, fossiles, paysages géologiques adaptés à chaque ère). " +
      "Une frise chronologique interactive (cliquer une ère y navigue directement). " +
      "EXIGENCE : le concept doit tenir de bout en bout, pas juste dans le hero — vérifie que chaque section respecte " +
      "vraiment la logique temps/couleur avant de terminer. Lisibilité malgré le parti-pris visuel fort." + COMMON,
  },
];

// ── Snapshot best-effort (calqué run-mango-nuit.ts) ──────────────────────────

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
  log(`▶ ${spec.name}`);

  if (!projectExists(spec.name)) {
    try {
      await createProject(spec.name, spec.template);
      log(`  ✓ projet créé (${spec.template})`);
    } catch (e) {
      const error = `createProject: ${(e as Error).message}`;
      log(`  ✗ ${error}`);
      return { name: spec.name, buildOk: false, resolvedBy: "none", attempts: 0, incomplete: false, costUsd: 0, durationMs: Date.now() - started, paletteInjected: [], changedFiles: 0, mangoqa: { checked: false }, error };
    }
  } else {
    log(`  · projet déjà existant — reprise`);
  }

  const { block, palette } = await buildMoodboard(spec.leaders);
  const fullTask = spec.task + block;

  let buildOk = false, resolvedBy = "none", attempts = 0, costUsd = 0, incomplete = false, buildSignal: string | undefined;
  let error: string | undefined;
  try {
    // maitreModel indiqué pour compat de signature, mais SANS EFFET : le gate
    // ELEVE_ESCALATE_ON_BLOCK reste NON défini (défaut OFF) → aucune escalade
    // Claude, test honnête du pipeline Élève seul (recâblage souverain de ce soir).
    //
    // (2026-07-14, corrigé après le 1er run) — functionalGate ACTIVÉ : sans ça, un
    // build vert sur le TEMPLATE INTACT (rien écrit) était compté comme un succès —
    // constaté sur 2/3 apps du premier run. Le judge réutilise judgeProject (déjà
    // importé pour le score goût final) — son axe `fonctionnel` existe déjà, jamais
    // branché ici jusqu'à présent. functionalMin=5 : seuil modéré, pas le max.
    const r = await runRelay(
      fullTask,
      dir,
      {
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

  // MangoQA — la contribution de ce script : le chemin CONTRAT (relay-contract.ts,
  // celui que suit Qwythos-9B) n'a AUCUNE intégration MangoQA native, contrairement
  // au moteur agentique (runClosureMangoQA dans relay-agentic.ts). On la fait ici,
  // en PURE OBSERVATION — le verdict est LOGUÉ, jamais utilisé pour relancer/corriger.
  const mangoqa: ProjectResult["mangoqa"] = { checked: false };
  let changedFiles = 0;
  if (buildOk) {
    try {
      const version = await commitVersion(dir, `run-3-complex-apps : ${spec.name}`);
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
  return { name: spec.name, buildOk, resolvedBy, attempts, incomplete, costUsd, durationMs: Date.now() - started, paletteInjected: palette, changedFiles, mangoqa, score, judgeComment, shotAfter, error, buildSignal };
}

// ── Bilan ─────────────────────────────────────────────────────────────────────

function writeBilan(results: ProjectResult[]): void {
  const now = new Date().toISOString();
  const L: string[] = [
    `# Bilan — 3 apps complexes, pipeline Élève+MangoQA pur, zéro intervention — ${now}`,
    "",
    `Pilote : **Élève local** (${process.env.ELEVE_MODEL ?? "?"}) seul — ELEVE_ESCALATE_ON_BLOCK non défini (défaut OFF) : aucun appel Claude, aucune intervention manuelle.`,
    "",
    "## Tableau",
    "",
    "| Projet | Build | Résolu par | Tentatives | Incomplet | MangoQA | Score goût | Coût | Durée |",
    "|--------|-------|------------|------------|-----------|---------|------------|------|-------|",
  ];
  for (const r of results) {
    const qa = r.mangoqa.checked ? (r.mangoqa.verdict === "green" ? "🟢" : "🔴") : "—";
    L.push(`| ${r.name} | ${r.buildOk ? "✅" : "❌"} | ${r.resolvedBy} | ${r.attempts} | ${r.incomplete ? "⚠ oui" : "non"} | ${qa} | ${r.score != null ? r.score + "/10" : "—"} | $${r.costUsd.toFixed(4)} | ${Math.round(r.durationMs / 60000)} min |`);
  }
  L.push("", "## Détail", "");
  for (const r of results) {
    L.push(`### ${r.name}`);
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
  const totalCost = results.reduce((s, r) => s + r.costUsd, 0);
  L.push("## Résumé", "", `- Builds OK : **${ok}/${results.length}**`, `- Coût Claude total (doit être $0) : **$${totalCost.toFixed(4)}**`, `- Captures : \`${SHOTS_DIR}\``);
  fs.writeFileSync(BILAN_FILE, L.join("\n") + "\n");
  log(`\n📋 Bilan : ${BILAN_FILE}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  if (!flag("ELEVE_CLOSURE_GATE")) {
    console.warn("[gardien] ⚠ ELEVE_CLOSURE_GATE est OFF — le Gardien natif (intention+goût) ne s'exécutera pas ; ce script ajoute quand même le check MangoQA lui-même après chaque build.");
  }
  log("\n🌙 ═══════════════════════════════════════════════════════════════");
  log(`   3 APPS COMPLEXES — pipeline Élève+MangoQA pur, zéro intervention`);
  log(`   ELEVE_ESCALATE_ON_BLOCK=${process.env.ELEVE_ESCALATE_ON_BLOCK ?? "(non défini = OFF)"}`);
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
