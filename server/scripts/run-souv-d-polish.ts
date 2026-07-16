// SOUV-D — passe esthétique de relance (2026-07-16, nuit, mode automatique).
// Réinjecte les critiques PRÉCISES de Raf sur les 5 apps de SOUV-D (note moyenne
// 5,75/10 — seuil 3 du protocole non atteint) comme brief correctif à l'Élève,
// sur le MÊME pipeline (createProject déjà fait, projet existant — pas de
// scaffold), toujours ZÉRO Claude. Mesure si le pipeline sait se corriger sur
// du feedback humain esthétique — donnée non encore mesurée par le protocole.
//
// Lancer :   npx tsx scripts/run-souv-d-polish.ts
// Reprendre : même commande (resumable via .run-souv-d-polish.state.json).

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { atomicWriteFileSync } from "../src/safe-io.js";
import { projectDir, WORKSPACE_DIR } from "../src/projects.js";
import { runRelay, defaultRelayDeps } from "../src/eleve.js";
import { judgeProject } from "../src/nocturnal.js";
import { capturePreview } from "../src/vision.js";
import { commitVersion, changedFilesInLastCommit } from "../src/versions.js";
import { isMangoQaActive, emitPhaseComplete, waitForVerdict } from "../src/mangoqa.js";
import { runAsActor } from "../src/perimeter-context.js";

const STATE_FILE = path.join(WORKSPACE_DIR, ".run-souv-d-polish.state.json");
const LOG_FILE = path.join(WORKSPACE_DIR, ".run-souv-d-polish.log");
const RESULTS_FILE = path.join(WORKSPACE_DIR, ".run-souv-d-polish.results.json");
const BILAN_FILE = path.join(WORKSPACE_DIR, ".run-souv-d-polish.bilan.md");
const SHOTS_DIR = path.join(WORKSPACE_DIR, ".run-souv-d-polish-shots");

function log(msg: string): void {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(LOG_FILE, line + "\n"); } catch { /* ignore */ }
}

interface PolishSpec {
  name: string;
  port: number;
  eleveModel: string;
  priorScore: string; // note de Raf, pour le bilan
  task: string;
}

const COMMON =
  `\n\nRègles : ne casse RIEN de ce qui fonctionne déjà (build vert, mécaniques existantes). ` +
  `Vérifie avec check_build ET teste_parcours avant de considérer la retouche terminée. ` +
  `Vraies photos Pexels (chercher_image) si tu ajoutes du visuel — jamais de placeholder.`;

const SPECS: PolishSpec[] = [
  {
    name: "brasero", port: 5241, eleveModel: "glm-5.2:cloud", priorScore: "8/10",
    task:
      "Retouche BRASERO. Retour de Raf : « magnifique, sauf la section Atelier/Contact qui est bâclée ». " +
      "Retravaille CETTE section précise avec le même niveau de soin que le Hero et les Origines : mise en page " +
      "riche (pas un simple formulaire minimal), vraies photos Pexels de l'atelier/torréfacteur au travail, " +
      "structure claire (horaires, adresse, visite sur RDV). Ne touche PAS aux autres sections déjà réussies." + COMMON,
  },
  {
    name: "derive", port: 5242, eleveModel: "qwen3.5:cloud", priorScore: "5/10",
    task:
      "Retouche DÉRIVE. Retour de Raf : « bof bof, l'idée est bonne mais ça manque de développement ». " +
      "Développe le jeu en profondeur SANS casser la logique existante : ajoute 3-4 événements aléatoires " +
      "supplémentaires variés et distincts (pas de répétition), enrichis la mise en scène visuelle de chaque " +
      "jauge et événement (icônes, transitions, réactions visuelles au changement d'état), et rends les choix " +
      "plus incarnés (texte plus vivant, pas juste des boutons plats)." + COMMON,
  },
  {
    name: "cadence", port: 5243, eleveModel: "qwen3.5:cloud", priorScore: "5/10",
    task:
      "Retouche CADENCE. Retour de Raf : « fonctionnel mais pas très élégant, l'UI n'est pas claire ». " +
      "Retravaille la hiérarchie visuelle SANS casser le calcul physiologique existant : zones d'effort mieux " +
      "distinguées visuellement (couleurs/contraste plus nets), graphique plus lisible (grille plus légère, " +
      "courbe plus épaisse, point courant mis en évidence), mise en page moins dense/confuse (plus d'espace, " +
      "regroupement plus clair des contrôles vs résultats), chiffres clés (FC actuelle, zone) plus lisibles." + COMMON,
  },
  {
    name: "veilleur", port: 5244, eleveModel: "glm-5.2:cloud", priorScore: "5/10",
    task:
      "Retouche VEILLEUR. Retour de Raf : « fonctionne mais très minimaliste, manque d'options de paramètres ». " +
      "Ajoute des réglages RÉELS par habitude (couleur au choix, icône/emoji, objectif hebdomadaire en jours), " +
      "une vue réglages globale (rappel quotidien on/off — juste l'état, pas besoin de vraie notification système), " +
      "SANS perdre la sobriété visuelle qui faisait sa force — pas de gamification criarde, reste calme et net." + COMMON,
  },
  {
    name: "lueur", port: 5245, eleveModel: "qwen3.5:cloud", priorScore: "non chiffré",
    task:
      "Retouche LUEUR. Retour de Raf : « les effets et la grande flèche sont adorés, GARDE-LES tels quels — mais " +
      "le design global est pauvre ». Approfondis la direction artistique SANS toucher aux effets/flèche déjà " +
      "réussis : typographie plus soignée (hiérarchie de tailles plus marquée, meilleur choix de police pour le " +
      "carnet de bord), richesse visuelle des sections de contenu au-delà du hero (texture, vraies photos " +
      "Pexels supplémentaires de phares/mer par section), mise en page moins nue." + COMMON,
  },
];

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

interface State { done: string[] }
function loadState(): State {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, "utf8")) as State; } catch { return { done: [] }; }
}
function saveState(s: State): void { atomicWriteFileSync(STATE_FILE, JSON.stringify(s, null, 2)); }
function markDone(s: State, id: string): void { if (!s.done.includes(id)) s.done.push(id); saveState(s); }

interface PolishResult {
  name: string;
  eleveModel: string;
  priorScore: string;
  buildOk: boolean;
  resolvedBy: string;
  attempts: number;
  changedFiles: number;
  mangoqa: { checked: boolean; verdict?: "green" | "red"; note?: string };
  score?: number;
  judgeComment?: string;
  shotAfter?: string;
  error?: string;
}

async function polishProject(spec: PolishSpec, state: State): Promise<PolishResult | null> {
  if (state.done.includes(`done-${spec.name}`)) { log(`⏭  ${spec.name} déjà retouché.`); return null; }
  const dir = projectDir(spec.name);
  if (!fs.existsSync(dir)) {
    log(`✗ ${spec.name} : dossier introuvable — skip`);
    return { name: spec.name, eleveModel: spec.eleveModel, priorScore: spec.priorScore, buildOk: false, resolvedBy: "none", attempts: 0, changedFiles: 0, mangoqa: { checked: false }, error: "dossier introuvable" };
  }
  log(`\n═══════════════════════════════════════════════════════════════`);
  log(`▶ retouche ${spec.name} (Élève : ${spec.eleveModel}, note préalable : ${spec.priorScore})`);

  let buildOk = false, resolvedBy = "none", attempts = 0, error: string | undefined;
  try {
    const r = await runRelay(
      spec.task,
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
    if (r.success) log(`  ✓ retouche OK — ${r.resolvedBy} en ${r.attempts} tentative(s)`);
    else { error = r.inspection.detail.slice(-300); log(`  ✗ retouche KO (${r.inspection.signal}) — ${error}`); }
  } catch (e) {
    error = `runRelay: ${(e as Error).message}`;
    log(`  ✗ ${error}`);
  }

  const mangoqa: PolishResult["mangoqa"] = { checked: false };
  let changedFiles = 0;
  if (buildOk) {
    try {
      const version = await commitVersion(dir, `souv-d-polish : ${spec.name}`);
      const files = version ? await changedFilesInLastCommit(dir) : [];
      changedFiles = files.length;
      if (isMangoQaActive()) {
        emitPhaseComplete(spec.name, "final", files);
        log(`  🛡️ MangoQA — signal émis, attente du verdict…`);
        const verdict = await waitForVerdict(spec.name, 300_000);
        if (verdict) {
          mangoqa.checked = true;
          mangoqa.verdict = verdict.verdict;
          mangoqa.note = verdict.rejection?.corrective_action;
          log(`  🛡️ MangoQA : ${verdict.verdict.toUpperCase()}${verdict.rejection ? ` — ${verdict.rejection.corrective_action}` : ""}`);
        }
      } else {
        log(`  ⚠ MangoQA inactif — non vérifié`);
      }
    } catch (e) {
      log(`  ⚠ MangoQA indisponible : ${(e as Error).message}`);
    }
  }

  const shotAfter = buildOk ? await snap(dir, spec.port, `${spec.name}-polish`) : undefined;
  let score: number | undefined, judgeComment: string | undefined;
  if (buildOk) {
    try {
      const j = await judgeProject(dir, spec.task);
      if (j) { score = j.score; judgeComment = j.comment; log(`  🏆 ${j.score}/10 — « ${j.comment} »`); }
    } catch { log(`  ⚠ juge indisponible`); }
  }

  markDone(state, `done-${spec.name}`);
  return { name: spec.name, eleveModel: spec.eleveModel, priorScore: spec.priorScore, buildOk, resolvedBy, attempts, changedFiles, mangoqa, score, judgeComment, shotAfter, error };
}

function writeBilan(results: PolishResult[]): void {
  const now = new Date().toISOString();
  const L: string[] = [
    `# Bilan SOUV-D — passe esthétique (retouches sur critiques précises de Raf) — ${now}`,
    "",
    "| Projet | Élève | Note préalable | Build | Résolu par | MangoQA | Score goût après |",
    "|--------|-------|----------------|-------|------------|---------|--------------------|",
  ];
  for (const r of results) {
    const qa = r.mangoqa.checked ? (r.mangoqa.verdict === "green" ? "🟢" : "🔴") : "—";
    L.push(`| ${r.name} | ${r.eleveModel} | ${r.priorScore} | ${r.buildOk ? "✅" : "❌"} | ${r.resolvedBy} | ${qa} | ${r.score != null ? r.score + "/10" : "—"} |`);
  }
  L.push("", "## Détail", "");
  for (const r of results) {
    L.push(`### ${r.name}`);
    L.push(`- Fichiers modifiés : ${r.changedFiles}`);
    if (r.mangoqa.checked) L.push(`- MangoQA : ${r.mangoqa.verdict}${r.mangoqa.note ? ` — ${r.mangoqa.note}` : ""}`);
    if (r.shotAfter) L.push(`- Capture après retouche : \`${r.shotAfter}\``);
    if (r.judgeComment) L.push(`- Avis juge goût : ${r.judgeComment}`);
    if (r.error) L.push(`- ⚠ Erreur : ${r.error}`);
    L.push("");
  }
  const escalades = results.filter((r) => r.resolvedBy === "maitre").length;
  L.push("## Résumé", "", `- Escalades Claude : ${escalades}/${results.length}`, `- Captures : \`${SHOTS_DIR}\``);
  fs.writeFileSync(BILAN_FILE, L.join("\n") + "\n");
  log(`\n📋 Bilan : ${BILAN_FILE}`);
}

async function main(): Promise<void> {
  log("\n🎨 ═══════════════════════════════════════════════════════════════");
  log(`   SOUV-D — passe esthétique, critiques précises de Raf réinjectées`);
  log("═══════════════════════════════════════════════════════════════════\n");

  const ollamaOk = await fetch(`${process.env.OLLAMA_URL ?? "http://localhost:11434"}/api/tags`).then((r) => r.ok).catch(() => false);
  log(ollamaOk ? "✓ Ollama :11434 OK" : "⚠ Ollama injoignable — arrêt");
  if (!ollamaOk) process.exit(1);
  log(isMangoQaActive() ? "✓ MangoQA actif" : "⚠ MangoQA inactif — builds non audités");

  const state = loadState();
  const results: PolishResult[] = [];
  for (const spec of SPECS) {
    try {
      const r = await polishProject(spec, state);
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
  log("\n🌅 TERMINÉ — passe esthétique SOUV-D.");
}

runAsActor("autonomous", main).catch((e) => {
  console.error("❌", e instanceof Error ? e.stack : e);
  process.exit(1);
});
