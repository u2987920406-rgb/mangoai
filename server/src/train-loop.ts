import "dotenv/config";

// Boucle d'entraînement nocturne (idée 32) — CLI autonome, JAMAIS importé en
// prod (comme audit-scan.ts). À lancer avant de dormir : MangoOS génère en
// boucle des créations TOUTES différentes (fond × forme × UX) et accumule de
// l'expérience pendant que tu dors.
//
// « Entraîner » ≠ ré-entraîner un modèle (les poids ne bougent pas). La boucle
// accumule : la COURBE D'APPRENTISSAGE (.metrics.jsonl) et, à chaque escalade
// Élève→Claude, un AXIOME de code (.axioms.md) — exactement le carburant que
// l'idée #28 (clapet v4) attend.
//
// Cerveau : l'ÉLÈVE LOCAL (Gemma via Ollama) → coût ≈ 0. Claude n'intervient que
// sur escalade, PLAFONNÉE (--max-escalations) pour borner le coût de la nuit.
// Disque : chaque projet est SUPPRIMÉ après mesure (garde --keep réussites).
//
// Lancer :  npx tsx src/train-loop.ts --minutes 480 --max-escalations 6 --keep 5
//   --minutes N      durée max (défaut 480 = 8 h)   | --count N nb max d'itérations
//   --max-escalations N  escalades Claude autorisées (défaut 6 ; 0 = pur $0)
//   --keep N         projets réussis conservés sur disque (défaut 5)
//   --dry-run N      n'exécute rien : imprime N prompts générés (diversité)

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createProject, projectDir, WORKSPACE_DIR } from "./projects.js";
import { runRelay, defaultRelayDeps, ELEVE_PROVIDER, type RelayDeps } from "./eleve.js";
import { runAsActor } from "./perimeter-context.js";
import { recordTurnMetrics } from "./metrics.js";
import { inferProjectType } from "./blueprints.js";
import { flag } from "./flags.js";
import { decideBudgetStop, spendGlobalBudget, localDateStr as globalBudgetToday, readGlobalBudgetState } from "./nocturnal-budget.js";
import { interruptAgent } from "./agent/agent.js";

const OLLAMA = process.env.OLLAMA_URL ?? "http://localhost:11434";
const TRAIN_LOG = path.join(WORKSPACE_DIR, ".train.jsonl");

// Capture un snapshot léger des fichiers source d'un projet — rendu autoportant
// dans .train.jsonl pour que la paire tâche→solution survive à rmProject().
function captureSource(dir: string, maxFiles = 8, maxChars = 3000): string {
  const srcDir = path.join(dir, "src");
  let out = "";
  let count = 0;
  const walk = (d: string) => {
    let items: fs.Dirent[];
    try { items = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const it of items) {
      if (count >= maxFiles) return;
      const p = path.join(d, it.name);
      if (it.isDirectory() && it.name !== "node_modules") { walk(p); }
      else if (/\.(jsx?|tsx?|css)$/.test(it.name)) {
        try {
          out += `\n--- ${path.relative(dir, p)} ---\n${fs.readFileSync(p, "utf8").slice(0, maxChars)}\n`;
          count++;
        } catch { /* skip */ }
      }
    }
  };
  walk(srcDir);
  return out;
}

// ── Moteur de diversité : fond (domaine) × forme/UX (style) × type ───────────
export const DOMAINS = [
  "un restaurant italien", "un coach de fitness", "un cabinet d'avocats d'affaires",
  "une startup SaaS d'analytics", "un studio de jeux vidéo indé", "une boulangerie artisanale",
  "une agence immobilière", "un podcast tech", "une ONG environnementale", "une équipe e-sport",
  "une clinique vétérinaire", "un photographe de mariage", "un paysagiste", "une marque de café de spécialité",
  "une école de musique", "un food truck de tacos", "une salle d'escalade", "un cabinet d'architectes",
  "une marque de cosmétiques bio", "un festival de musique", "une plateforme de cours en ligne",
  "un fleuriste haut de gamme", "un constructeur de tiny houses", "une brasserie artisanale",
  "un institut de yoga", "une agence de voyage d'aventure", "un disquaire vinyle", "une marque de vélos électriques",
  "un traiteur événementiel", "une boutique de jeux de société",
];

export const STYLES = [
  "minimaliste, beaucoup de blanc, une seule couleur d'accent",
  "sombre néon, dégradés violet/cyan, glassmorphism",
  "éditorial, typographie sérif, mise en page deux colonnes",
  "brutaliste, bordures épaisses, contrastes francs, monospace",
  "pastel ludique, formes arrondies, illustrations douces",
  "corporate sobre, bleu nuit, dense en informations",
  "rétro années 80, couleurs saturées, grille synthwave",
  "swiss/international, grille stricte, Helvetica-like",
  "luxe, noir et or, espaces généreux, sérif fin",
  "nature, tons terre et vert, texture organique",
  "terminal/hacker, fond noir, texte vert phosphore",
  "magazine vibrant, gros titres, photos plein cadre",
  "néo-rétro papier, beige, ombres douces, tampons",
  "tech épuré façon Linear, gris fins, micro-animations",
  "enfantin coloré, gros boutons, emojis, arrondis",
  "monochrome contrasté, noir/blanc, accent rouge unique",
  "aquarelle, dégradés doux, sérif manuscrite",
  "industriel, métal, jaune sécurité, stencils",
  "scandinave, bois clair, beige, minimal chaleureux",
  "cyberpunk, glitch, rose magenta, scanlines",
  "art déco, motifs géométriques dorés, symétrie",
  "flat coloré façon dashboard, cartes nettes, ombres légères",
  "néomorphisme, reliefs doux, monochrome pastel",
  "presse quotidienne, colonnes serrées, sérif, filets",
];

export type TaskKind = "webapp" | "slides" | "cv" | "doc" | "devis" | "dashboard" | "multipage" | "wizard";
export const TASK_KINDS: TaskKind[] = ["webapp", "slides", "cv", "doc", "devis", "dashboard", "multipage", "wizard"];

// Construit la requête envoyée à l'Élève — pure (testable). Le domaine porte le
// FOND, le style porte la FORME et l'UX → chaque combinaison est unique.
// Les kinds dashboard/multipage/wizard sont plus difficiles (multi-composants,
// état complexe, routing) pour stresser l'Élève et déclencher davantage d'escalades.
export function composeTask(kind: TaskKind, domain: string, style: string): string {
  // style vide ("") = lot "free style" : pas de DA imposée → l'agent conçoit
  // lui-même la charte (sert à juger l'apport réel du moodboard Sharingan).
  const ux = style
    ? `Direction artistique/UX imposée : ${style}.`
    : `Aucune direction artistique imposée : conçois TOI-MÊME une identité visuelle soignée et distinctive — sers-toi du moodboard pour ancrer une vraie charte graphique (couleurs, typographie, ambiance) sur des leaders réels du domaine.`;
  switch (kind) {
    case "webapp":
      return `Crée une petite web app React pour ${domain} (1 fonctionnalité claire et utile, données factices). ${ux}`;
    case "slides":
      return `Crée une présentation de slides (deck 16:9, navigation clavier) qui pitche ${domain} en 5 diapos. ${ux}`;
    case "cv":
      return `Crée un CV web d'une page pour une personne travaillant chez ${domain} (profil, expériences, compétences factices). ${ux}`;
    case "doc":
      return `Crée un document web imprimable (type PDF, format A4) — une plaquette de présentation de ${domain}. ${ux}`;
    case "devis":
      return `Crée un générateur de devis (tableau type Excel, lignes + total qui se calcule) pour ${domain}. ${ux}`;
    case "dashboard":
      return `Crée un dashboard analytics complet pour ${domain} : barre latérale de navigation, au moins 3 sections (vue d'ensemble avec KPIs chiffrés, graphiques en barres et en courbes avec données factices, tableau de données filtrable), états loading et empty gérés. ${ux} Utilise Tailwind v4.`;
    case "multipage":
      return `Crée une application React MULTI-PAGES pour ${domain} avec react-router-dom (installe si absent) : page Accueil (hero + features), page À propos (équipe + valeurs), page Contact (formulaire avec validation), page 404. Navigation responsive en header. ${ux} Utilise Tailwind v4.`;
    case "wizard":
      return `Crée un formulaire multi-étapes (wizard 4 étapes avec barre de progression) pour ${domain} : étape 1 infos de base, étape 2 détails, étape 3 options/préférences, étape 4 récapitulatif + confirmation. Validation à chaque étape, boutons Précédent/Suivant, état global partagé entre étapes. ${ux} Utilise Tailwind v4.`;
  }
}

const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

export interface GenPrompt {
  kind: TaskKind;
  domain: string;
  style: string;
  task: string;
  projectType: string;
}

/** Tire des combinaisons UNIQUES (kind×domain×style). Cap = nb de combos.
 * opts.freeStyle = aucune DA imposée (style "") → unicité sur kind×domain. */
export function generateUniquePrompts(n: number, opts: { freeStyle?: boolean } = {}): GenPrompt[] {
  const seen = new Set<string>();
  const out: GenPrompt[] = [];
  const styleCount = opts.freeStyle ? 1 : STYLES.length;
  const maxCombos = TASK_KINDS.length * DOMAINS.length * styleCount;
  const target = Math.min(n, maxCombos);
  let guard = 0;
  while (out.length < target && guard < maxCombos * 20) {
    guard++;
    const kind = pick(TASK_KINDS);
    const domain = pick(DOMAINS);
    const style = opts.freeStyle ? "" : pick(STYLES);
    const key = `${kind}|${domain}|${style}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const task = composeTask(kind, domain, style);
    out.push({ kind, domain, style, task, projectType: inferProjectType(task) });
  }
  return out;
}

// ── Arguments CLI ────────────────────────────────────────────────────────────
function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function ollamaUp(): Promise<boolean> {
  try {
    const r = await fetch(`${OLLAMA}/api/tags`);
    return r.ok;
  } catch {
    return false;
  }
}

// ── Circuit breaker Ollama (revue globale 2026-07-03, action #7) ────────────
// `ollamaUp()` n'est testé QU'UNE FOIS au boot (ligne ci-dessus, dans main()).
// Si Ollama meurt à 2h du matin en pleine boucle, chaque itération restante
// scaffoldait un projet sur disque PUIS échouait, en boucle serrée, jusqu'au
// matin — sans détection « N échecs consécutifs → stop ». Ce compteur PUR
// (comme decideBreakerStop/decideBudgetStop de nocturnal.ts) ferme la boucle :
// gate OFF → jamais (comportement historique, byte-identique).
export interface OllamaCircuitDecision {
  stop: boolean;
  /** Raison lisible (loguée) quand stop=true. */
  reason?: string;
}

/** Décide si le lot doit s'arrêter AVANT l'itération suivante après N échecs
 * CONSÉCUTIFS. PUR, testable (aucun accès réseau/horloge). */
export function decideOllamaCircuitStop(
  gateOn: boolean,
  consecutiveFailures: number,
  maxConsecutiveFailures: number,
): OllamaCircuitDecision {
  if (!gateOn) return { stop: false };
  if (consecutiveFailures < maxConsecutiveFailures) return { stop: false };
  return {
    stop: true,
    reason: `${consecutiveFailures} échec(s) CONSÉCUTIF(S) — Ollama semble injoignable/mort en pleine nuit (relance « ollama serve » puis relance le run).`,
  };
}

function rmProject(dir: string): void {
  for (let i = 0; i < 3; i++) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
      return;
    } catch {
      // node_modules can be momentarily locked on Windows — best effort.
    }
  }
}

async function main(): Promise<void> {
  if (!flag("ELEVE_CLOSURE_GATE")) {
    console.warn("[gardien] ⚠ ELEVE_CLOSURE_GATE est OFF pour ce run — le Gardien (intention+goût+QA) ne s'exécutera pas, seul le build sera vérifié.");
  }

  // Dry-run : juste prouver la diversité, sans rien lancer.
  const dry = arg("dry-run");
  if (dry !== undefined) {
    const n = Number(dry) || 8;
    console.log(`— Aperçu de ${n} prompts générés (diversité fond × forme × UX) —\n`);
    for (const p of generateUniquePrompts(n)) console.log(`• [${p.kind}/${p.projectType}] ${p.task}\n`);
    return;
  }

  const minutes = Number(arg("minutes") ?? 480);
  const count = arg("count") ? Number(arg("count")) : Infinity;
  const maxEscalations = Number(arg("max-escalations") ?? 6);
  const keep = Number(arg("keep") ?? 5);
  const escalateModel = process.env.TRAIN_ESCALATE_MODEL ?? "sonnet";

  if (ELEVE_PROVIDER === "openai") {
    console.log("⚠ Élève = provider « openai » (API distante) — cette boucle N'EST PLUS gratuite : chaque création coûte des appels API. Ctrl-C pour annuler.");
  } else if (!(await ollamaUp())) {
    console.error(`❌ Ollama injoignable sur ${OLLAMA}. Lance d'abord « ollama serve » dans un terminal séparé.`);
    process.exit(1);
  }

  // Identifiant unique du run : stampe chaque ligne du journal pour que chaque
  // run soit isolable (bilan par run, jamais le cumul de tout le fichier).
  const runId = new Date().toISOString();
  const deadline = Date.now() + minutes * 60_000;
  // (N17, watchdog mural par itération) Temps alloué par projet, défaut 45 min.
  // Regarde nocturnal.ts ligne 557 pour la même logique.
  const projectBudgetMs = Math.max(10 * 60_000, Number(process.env.TRAIN_LOOP_PROJECT_BUDGET_MIN ?? 45) * 60_000);
  // Escalade plafonnée : au-delà du cap, on neutralise l'escalade (coût borné).
  let escalations = 0;
  const deps: RelayDeps = {
    ...defaultRelayDeps,
    escalate: async (ctx) => {
      if (escalations >= maxEscalations) {
        console.log("[train] plafond d'escalades atteint → pas d'escalade (échec enregistré tel quel)");
        return { axiom: false, costUsd: 0, codeChanged: false };
      }
      escalations++;
      console.log(`[train] escalade Claude ${escalations}/${maxEscalations}…`);
      return defaultRelayDeps.escalate({ ...ctx, maitreModel: escalateModel });
    },
  };

  console.log(
    `🌙 Boucle d'entraînement — Élève local, durée ≤ ${minutes} min, escalades ≤ ${maxEscalations}, garde ${keep} réussites.\n`,
  );

  // Pré-génère assez de prompts uniques pour la nuit (cap au nb de combos).
  const queue = generateUniquePrompts(count === Infinity ? 2000 : count);
  const stats = { done: 0, eleve: 0, maitre: 0, failed: 0, axioms: 0, costUsd: 0, kept: 0 };
  let i = 0;
  // Budget-$ DUR global (gaté NOCTURNAL_BUDGET_HARD), PARTAGÉ avec Phase 1
  // (run-tonight.ts/run-mango-nuit.ts) et Phase 2 (nocturnal.ts) via le ledger
  // data/global-budget.json (nocturnal-budget.ts). $0/absent = illimité.
  const globalBudgetCapUsd = Number(process.env.NOCTURNAL_GLOBAL_BUDGET_USD ?? 0);
  // Circuit breaker Ollama (gaté TRAIN_LOOP_OLLAMA_BREAKER) : compteur d'échecs
  // CONSÉCUTIFS, remis à zéro à la première réussite. Seuil configurable, défaut 3.
  let consecutiveFailures = 0;
  const maxConsecutiveFailures = Number(process.env.TRAIN_LOOP_OLLAMA_MAX_FAILS ?? 3);

  for (const p of queue) {
    if (Date.now() >= deadline || stats.done >= count) break;
    // Même frontière que le cap --max-escalations ci-dessus : arrêt NET AVANT
    // l'itération suivante si le cumul $ (partagé Phase 0/1/2) dépasse le
    // plafond — jamais en cours de génération. Gate OFF → 0 I/O.
    const budgetStop = decideBudgetStop(
      flag("NOCTURNAL_BUDGET_HARD"),
      globalBudgetCapUsd,
      globalBudgetToday(),
      () => readGlobalBudgetState(),
    );
    if (budgetStop.stop) {
      console.warn(`[train] 💰 ${budgetStop.reason} — arrêt propre (${stats.done}/${i} itération(s) faite(s)).`);
      break;
    }
    // (revue 2026-07-03, action #7) même frontière : N échecs CONSÉCUTIFS →
    // stop propre au lieu de scaffolder-puis-échouer en boucle serrée jusqu'au
    // matin (Ollama mort). Gate OFF → jamais, comportement historique.
    const circuitStop = decideOllamaCircuitStop(flag("TRAIN_LOOP_OLLAMA_BREAKER"), consecutiveFailures, maxConsecutiveFailures);
    if (circuitStop.stop) {
      console.warn(`[train] ⚡ ${circuitStop.reason} — arrêt propre (${stats.done}/${i} itération(s) faite(s)).`);
      break;
    }
    i++;
    const name = `train-${i}`;
    const dir = projectDir(name);
    const started = Date.now();
    console.log(`\n[${i}] ${p.task}`);

    rmProject(dir); // au cas où un run précédent aurait laissé le dossier
    // (N17) Watchdog mural par itération : calcule la deadline du projet et
    // lance un timeout qui interrompt si elle est dépassée. Même pattern que
    // nocturnal.ts ligne 362-366 (interruptAgent).
    const projectDeadline = Date.now() + projectBudgetMs;
    const watchdog = Number.isFinite(projectDeadline)
      ? setTimeout(() => {
          console.log(`⏱ Budget mural du projet [${i}] dépassé — tour interrompu.`);
          void interruptAgent().catch(() => undefined);
        }, Math.max(1_000, projectDeadline - Date.now()))
      : undefined;
    try {
      await createProject(name);
      // (#180 É2) Phase 0 d'entraînement nocturne → acteur AUTONOME (périmètre restreint).
      const r = await runAsActor("autonomous", () => runRelay(p.task, dir, { maitreModel: escalateModel }, deps));
      const durationMs = Date.now() - started;
      // (action #7) succès = remise à zéro de la série ; échec = incrémente
      // (le compteur ne PÈSE que si TRAIN_LOOP_OLLAMA_BREAKER=on, cf. plus haut).
      consecutiveFailures = r.success ? 0 : consecutiveFailures + 1;

      recordTurnMetrics({
        ts: new Date().toISOString(),
        project: name,
        model: "eleve",
        mode: "mvp",
        costUsd: r.costUsd,
        numTurns: r.attempts,
        snapshots: 0,
        durationMs,
        error: !r.success,
        resolvedBy: r.resolvedBy,
        attempts: r.attempts,
        projectType: p.projectType,
      });
      // #55a — escalade Maître réussie = paire tâche→solution de qualité (candidat LoRA).
      // On capture le code source ICI (dossier encore présent) pour que l'entrée
      // soit autoportante — rmProject() peut supprimer ensuite sans perte.
      const lora_candidate = r.resolvedBy === "maitre" && r.success;
      const solution = lora_candidate ? captureSource(dir) : undefined;
      fs.appendFileSync(
        TRAIN_LOG,
        `${JSON.stringify({ ts: new Date().toISOString(), runId, name, kind: p.kind, projectType: p.projectType, resolvedBy: r.resolvedBy, attempts: r.attempts, success: r.success, axiom: r.axiom, costUsd: r.costUsd, durationMs, task: p.task, lora_candidate, ...(solution ? { solution } : {}) })}\n`,
      );

      stats.done++;
      stats.costUsd += r.costUsd;
      // Comptabilise la dépense réelle sur le ledger PARTAGÉ — best effort,
      // seulement si le gate est ON (0 I/O sinon).
      if (flag("NOCTURNAL_BUDGET_HARD")) spendGlobalBudget(r.costUsd);
      if (r.axiom) stats.axioms++;
      if (r.resolvedBy === "eleve") stats.eleve++;
      else if (r.resolvedBy === "maitre") stats.maitre++;
      else stats.failed++;

      // Disque : on garde les premières réussites (échantillons), on jette le reste.
      const keepThis = r.success && stats.kept < keep;
      if (keepThis) {
        stats.kept++;
        console.log(`[${i}] conservé comme échantillon (${stats.kept}/${keep})`);
      } else {
        rmProject(dir);
      }
    } catch (e) {
      stats.failed++;
      consecutiveFailures++; // (action #7) une itération qui LÈVE est aussi un échec de la série.
      console.error(`[${i}] itération en erreur : ${(e as Error).message}`);
      rmProject(dir);
    } finally {
      if (watchdog) clearTimeout(watchdog);
    }
  }

  // Bilan PAR RUN (compteurs remis à zéro à chaque lancement) sous forme de tableau.
  const pct = (n: number) => (stats.done ? `${Math.round((n / stats.done) * 100)}%` : "—");
  const rows: [string, string][] = [
    ["Run", runId],
    ["Créations", String(stats.done)],
    ["Élève seul ($0)", `${stats.eleve} (${pct(stats.eleve)})`],
    ["Escalades Claude", `${stats.maitre} (${pct(stats.maitre)})`],
    ["Échecs", `${stats.failed} (${pct(stats.failed)})`],
    ["Axiomes appris", String(stats.axioms)],
    ["Coût total", `$${stats.costUsd.toFixed(4)}`],
    ["Échantillons gardés", String(stats.kept)],
  ];
  const w = Math.max(...rows.map(([k]) => k.length));
  console.log("\n🌅 Bilan du run :");
  for (const [k, v] of rows) console.log(`  ${k.padEnd(w)} │ ${v}`);
  console.log(`\nJournal : ${TRAIN_LOG} (filtrer sur runId « ${runId} ») — métriques au dashboard 📊.`);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((e) => {
    console.error("❌", e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
