// Run test nocturne MangoOS — 2026-06-18
// 5 projets : A/B/D via l'Élève local (Gemma 4 12B, $0, freeStyle)
//             C/E via Claude Élite → ✨ Esthétique → 🛡️ Finition
//
// Reprend drive-game-test.ts comme modèle (SSE, state file, résumable).
// Lancer : npx tsx src/run-showcase.ts
// Reprendre : npx tsx src/run-showcase.ts  (même commande, l'état est gardé)

import { nightStopGate } from "../src/night-guards.js";
import { nightBudgetSpend } from "../src/nocturnal-budget.js";
import fs from "node:fs";
import path from "node:path";
import { projectDir, WORKSPACE_DIR } from "../src/projects.js";
import { judgeProject } from "../src/nocturnal.js";
import { runEvolution } from "../src/prompt-evolution.js";

const BASE = process.env.MANGO_URL ?? "http://localhost:3000";
const OLLAMA = process.env.OLLAMA_URL ?? "http://localhost:11434";

const STATE_FILE  = path.join(WORKSPACE_DIR, ".showcase.state.json");
const LOG_FILE    = path.join(WORKSPACE_DIR, ".showcase.log");
const RESULTS_FILE = path.join(WORKSPACE_DIR, ".showcase.results.json");
const BILAN_FILE  = path.join(WORKSPACE_DIR, ".showcase.bilan.md");

// ── Logging ───────────────────────────────────────────────────────────────────
function log(msg: string): void {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + "\n");
}

// ── State (résumabilité) ──────────────────────────────────────────────────────
interface ShowcaseState {
  done: string[];
  sessions: Record<string, string>; // projectName → dernière sessionId
}

function loadState(): ShowcaseState {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, "utf8")) as ShowcaseState; }
  catch { return { done: [], sessions: {} }; }
}
function saveState(s: ShowcaseState): void {
  fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));
}
function markDone(s: ShowcaseState, id: string): void {
  if (!s.done.includes(id)) s.done.push(id);
  saveState(s);
}

// ── Résultats ──────────────────────────────────────────────────────────────────
interface ProjectResult {
  name: string;
  lot: "eleve" | "claude";
  template: string;
  task: string;
  buildOk: boolean;
  score?: number;
  dims?: Record<string, number>;
  judgeComment?: string;
  costUsd: number;
  durationMs: number;
  phases: PhaseResult[];
  capacites: string[];
  error?: string;
}

interface PhaseResult {
  id: string;
  mode: string;
  ok: boolean;
  costUsd: number;
  numTurns: number;
  ms: number;
  error?: string;
}

// ── Consigne d'autonomie (identique à drive-game-test.ts) ────────────────────
const AUTO =
  'IMPORTANT : session autonome, NE me pose AUCUNE question. Prends toutes les décisions toi-même avec des défauts ÉNONCÉS brièvement, puis construis directement. Réponds "vas-y avec ton jugement" à tes propres questions de cadrage.';

// ── Prérequis ─────────────────────────────────────────────────────────────────
async function checkBackend(): Promise<boolean> {
  try { return (await fetch(`${BASE}/api/projects`)).ok; } catch { return false; }
}
async function checkOllama(): Promise<boolean> {
  try { return (await fetch(`${OLLAMA}/api/tags`)).ok; } catch { return false; }
}

// ── SSE reader (modèle drive-game-test.ts) ────────────────────────────────────
async function runPhase(
  projectName: string,
  phase: { id: string; mode: string; prompt: string; model?: string },
  sessionId: string | undefined,
  template?: string,
): Promise<{ result: PhaseResult; sessionId: string | undefined }> {
  const started = Date.now();
  // template n'a d'effet que sur le TOUT PREMIER appel (projet inexistant côté
  // serveur, cf. index.ts isNewProject) — l'envoyer aux phases suivantes est
  // inoffensif (ignoré, le projet existe déjà). Corrige un bug du driver
  // d'origine : template n'était JAMAIS envoyé, donc C/E auraient reçu le
  // template de base plutôt que shadcn/vitrine.
  const body: Record<string, unknown> = { prompt: phase.prompt, projectName, model: phase.model ?? "sonnet", mode: phase.mode, sessionId };
  if (template) body.template = template;
  let res: Response;
  try {
    res = await fetch(`${BASE}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (e) {
    return {
      result: { id: phase.id, mode: phase.mode, ok: false, costUsd: 0, numTurns: 0, ms: Date.now() - started, error: `fetch: ${(e as Error).message}` },
      sessionId,
    };
  }
  if (!res.ok || !res.body) {
    return {
      result: { id: phase.id, mode: phase.mode, ok: false, costUsd: 0, numTurns: 0, ms: Date.now() - started, error: `HTTP ${res.status}` },
      sessionId,
    };
  }

  let newSession = sessionId;
  let costUsd = 0, numTurns = 0, ok = false;
  let error: string | undefined;

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const parts = buf.split("\n\n");
    buf = parts.pop() ?? "";
    for (const part of parts) {
      const dataLine = part.split("\n").find((l) => l.startsWith("data: "));
      if (!dataLine) continue;
      let ev: any;
      try { ev = JSON.parse(dataLine.slice(6)); } catch { continue; }
      switch (ev.type) {
        case "status": log(`  · [${phase.id}] ${ev.text}`); break;
        case "text":
          if (ev.text?.trim()) log(`  💬 [${phase.id}] ${ev.text.trim().slice(0, 140)}`);
          break;
        case "tool": log(`  🔧 [${phase.id}] ${ev.name} ${String(ev.detail ?? "").slice(0, 80)}`); break;
        case "result":
          ok = !!ev.ok; costUsd = ev.costUsd ?? 0; numTurns = ev.numTurns ?? 0;
          error = ev.error;
          if (ev.sessionId) newSession = ev.sessionId;
          break;
        case "error": error = ev.message; log(`  ❌ [${phase.id}] ${ev.message}`); break;
      }
    }
  }
  return { result: { id: phase.id, mode: phase.mode, ok, costUsd, numTurns, ms: Date.now() - started, error }, sessionId: newSession };
}

// ── LOT ÉLÈVE : via /api/chat (model:"eleve"), même pipeline que le lot Claude ─
// Passe DÉLIBÉRÉMENT par /api/chat plutôt que par runRelay() en direct (comme
// le driver d'origine le faisait) : seul ce chemin déclenche le hook CTXLOOP
// (verifierChoixGabaritEnArrierePlan, index.ts), le briefing Stratège #164, et
// tout ce qui est câblé au niveau du handler plutôt qu'à l'intérieur de
// runRelay lui-même. Sans ça, le lot Élève tournerait "à côté" du vrai pipeline
// de production — contraire à la demande de Raf de pousser TOUS les mécanismes.
async function runEleveProject(
  name: string,
  template: string,
  task: string,
  capacites: string[],
  state: ShowcaseState,
): Promise<ProjectResult> {
  const started = Date.now();
  log(`\n═══ [ÉLÈVE via /api/chat] ${name} (template: ${template}) ═══`);
  log(`Tâche : ${task.slice(0, 200)}…`);

  const phaseKey = `eleve-${name}-build`;
  const dir = projectDir(name);
  let buildOk = false;
  let costUsd = 0;
  let error: string | undefined;

  if (state.done.includes(phaseKey)) {
    log(`⏭  [build] déjà fait.`);
    buildOk = true;
  } else {
    let sessionId: string | undefined = state.sessions[name];
    const phase = { id: "A1-build", mode: "elite", model: "eleve", prompt: task };
    const { result, sessionId: ns } = await runPhase(name, phase, sessionId, template);
    if (ns) { state.sessions[name] = ns; saveState(state); }
    buildOk = result.ok;
    costUsd = result.costUsd;
    error = result.error;
    const tag = result.ok ? "✅" : "❌";
    log(`${tag} build — turns:${result.numTurns} $${result.costUsd.toFixed(4)} ${Math.round(result.ms / 1000)}s${result.error ? " ERR:" + result.error : ""}`);
    if (result.ok) markDone(state, phaseKey);
  }

  let score: number | undefined;
  let dims: Record<string, number> | undefined;
  let judgeComment: string | undefined;
  if (buildOk) {
    try {
      const j = await judgeProject(dir, task);
      if (j) {
        score = j.score;
        dims = j.dims as unknown as Record<string, number>;
        judgeComment = j.comment;
        log(`🏆 Score : ${j.score}/10 — « ${j.comment} »`);
      }
    } catch {
      log(`⚠ Juge indisponible`);
    }
  }

  return { name, lot: "eleve", template, task, buildOk, score, dims, judgeComment, costUsd, durationMs: Date.now() - started, phases: [], capacites, error };
}

// ── Créer un super-agent via l'API ─────────────────────────────────────────────
async function createSuperAgent(domain: string, description: string): Promise<string | null> {
  log(`\n🤖 Création super-agent « ${domain} »…`);
  try {
    const r = await fetch(`${BASE}/api/super-agent/build`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain, description }),
    });
    if (!r.ok) { log(`✗ HTTP ${r.status}`); return null; }
    const data = (await r.json()) as { id?: string; name?: string };
    log(`✓ Créé : ${data.name ?? "(sans nom)"} (id ${data.id ?? "?"})`);
    return data.id ?? null;
  } catch (e) {
    log(`✗ Exception : ${(e as Error).message}`);
    return null;
  }
}

// ── LOT CLAUDE : phases SSE séquentielles ──────────────────────────────────────
async function runClaudeProject(
  name: string,
  template: string,
  specTask: string,
  phases: Array<{ id: string; mode: string; prompt: string }>,
  capacites: string[],
  state: ShowcaseState,
): Promise<ProjectResult> {
  const started = Date.now();
  log(`\n═══ [CLAUDE] ${name} ═══`);

  let sessionId: string | undefined = state.sessions[name];
  const phaseResults: PhaseResult[] = [];
  let buildOk = false;
  let totalCost = 0;
  const dir = projectDir(name);

  for (const phase of phases) {
    const phaseKey = `claude-${name}-${phase.id}`;
    if (state.done.includes(phaseKey)) {
      log(`⏭  [${phase.id}] déjà fait.`);
      phaseResults.push({ id: phase.id, mode: phase.mode, ok: true, costUsd: 0, numTurns: 0, ms: 0 });
      continue;
    }

    log(`\n▶ [${phase.id}] mode ${phase.mode}…`);
    // template n'a d'effet que sur le tout 1er appel (projet inexistant) — le
    // passer à chaque phase est inoffensif, corrige le bug d'origine où
    // createProject recevait toujours template:undefined.
    const { result, sessionId: ns } = await runPhase(name, phase, sessionId, template);
    if (ns) {
      sessionId = ns;
      state.sessions[name] = ns;
      saveState(state);
    }
    phaseResults.push(result);
    totalCost += result.costUsd;

    const tag = result.ok ? "✅" : "❌";
    log(`${tag} ${phase.id} — turns:${result.numTurns} $${result.costUsd.toFixed(4)} ${Math.round(result.ms / 1000)}s${result.error ? " ERR:" + result.error : ""}`);

    if (result.ok) {
      markDone(state, phaseKey);
      buildOk = true;
    } else {
      log(`⚠ Phase en échec — on continue (mode nuit autonome)`);
    }
  }

  let score: number | undefined;
  let dims: Record<string, number> | undefined;
  let judgeComment: string | undefined;
  if (buildOk) {
    try {
      const j = await judgeProject(dir, specTask);
      if (j) {
        score = j.score;
        dims = j.dims as unknown as Record<string, number>;
        judgeComment = j.comment;
        log(`🏆 Score : ${j.score}/10 — « ${j.comment} »`);
      }
    } catch {
      log(`⚠ Juge indisponible`);
    }
  }

  return { name, lot: "claude", template, task: specTask, buildOk, score, dims, judgeComment, costUsd: totalCost, durationMs: Date.now() - started, phases: phaseResults, capacites };
}

// ── Bilan matinal ─────────────────────────────────────────────────────────────
function writeBilan(results: ProjectResult[], evolutionSummary: string): void {
  const now = new Date().toISOString();
  const lines: string[] = [
    `# Bilan run showcase — ${now}`,
    "",
    "## Tableau des 5 projets",
    "",
    "| Projet | Lot | Template | Build | Score | Coût | Durée | Capacités exercées |",
    "|--------|-----|----------|-------|-------|------|-------|--------------------|",
  ];
  for (const r of results) {
    lines.push(
      `| ${r.name} | ${r.lot} | ${r.template} | ${r.buildOk ? "✅" : "❌"} | ${r.score != null ? `${r.score}/10` : "—"} | $${r.costUsd.toFixed(3)} | ${Math.round(r.durationMs / 60000)} min | ${r.capacites.join(" · ")} |`,
    );
  }

  const withScore = results.filter((r) => r.score != null);
  if (withScore.length) {
    lines.push("", "## Scores par axe", "");
    for (const r of withScore) {
      const d = r.dims ?? {};
      lines.push(
        `**${r.name}** (${r.score}/10) : ${Object.entries(d).map(([k, v]) => `${k}=${v}`).join(" · ")}`,
        `→ ${r.judgeComment ?? ""}`,
        "",
      );
    }
  }

  lines.push("## Auto-réécriture des règles #76", "");
  lines.push(evolutionSummary || "(analyse indisponible)");

  const ok = results.filter((r) => r.buildOk).length;
  const totalCost = results.reduce((s, r) => s + r.costUsd, 0);
  const avgScore = withScore.reduce((s, r) => s + (r.score ?? 0), 0) / Math.max(1, withScore.length);
  lines.push(
    "",
    "## Résumé",
    "",
    `- **Builds OK** : ${ok}/${results.length}`,
    `- **Score moyen** : ${avgScore.toFixed(1)}/10`,
    `- **Coût total** : $${totalCost.toFixed(4)}`,
    `- **Projets en échec** : ${results.filter((r) => !r.buildOk).map((r) => r.name).join(", ") || "aucun"}`,
  );

  fs.writeFileSync(BILAN_FILE, lines.join("\n") + "\n");
  log(`\n📋 Bilan écrit : ${BILAN_FILE}`);
}

// ── Tâches ───────────────────────────────────────────────────────────────────

// A — portfolio photographe mariage, template vitrine, freeStyle
const TASK_A = `Crée une application React MULTI-PAGES pour un photographe de mariage avec react-router-dom : page Accueil (hero plein cadre + galerie photos en grille), page Portfolio (galeries organisées par style), page À propos (portrait + philosophie), page Contact (formulaire avec validation). Navigation responsive en header. Aucune direction artistique imposée : conçois TOI-MÊME une identité visuelle soignée et distinctive — sers-toi du moodboard Sharingan pour ancrer une vraie charte graphique (couleurs, typographie, ambiance) sur des leaders réels du domaine. Utilise Tailwind v4.`;

// B — dashboard SaaS analytics, template mantine, freeStyle
const TASK_B = `Crée un dashboard analytics complet pour une startup SaaS d'analytics : barre latérale de navigation, au moins 3 sections (vue d'ensemble avec KPIs chiffrés, graphiques en barres et en courbes avec données factices, tableau de données filtrable), états loading et empty gérés. Aucune direction artistique imposée : conçois TOI-MÊME une identité visuelle soignée — utilise ton moodboard Sharingan sur des leaders SaaS (Linear, Vercel, PostHog…) pour ancrer une vraie charte graphique distinctive. Utilise les composants Mantine disponibles dans le template.`;

// D — mini-jeu 2D, template phaser, freeStyle
const TASK_D = `Crée un mini-jeu 2D avec Phaser 3 pour un studio de jeux vidéo indé : un runner ou platformer simple (déplacement gauche/droite, obstacles générés aléatoirement, score croissant, game over + restart). Tire pleinement parti du template Phaser 3 déjà installé (scènes, groupes statiques, physique arcade). Aucune direction artistique imposée : conçois TOI-MÊME l'identité visuelle du jeu — couleurs, style pixel/néon/cartoon au choix via le moodboard. Utilise Tailwind v4 pour le wrapper UI.`;

// C — SaaS contact form, template shadcn
const SPEC_C = `Un formulaire de contact SaaS multi-étapes pour une plateforme B2B (3 étapes : coordonnées → besoins → confirmation), avec Supabase Auth (inscription/connexion), tests Vitest sur la validation de chaque étape, et un design professionnel shadcn/ui sobre.`;

const PHASES_C = [
  {
    id: "C1-cadrage",
    mode: "elite",
    prompt: `${AUTO}\n\nNouveau projet SaaS. ${SPEC_C}\n\nPhase 1 — cadrage fondateur + structure : fais le cadrage (contrat de langage : form/step/field/validation/submission/auth/user… ; Miroir visuel de ce que tu comprends), installe Supabase Auth (useAuth hook, pages Login/Signup/ProtectedRoute), construis le formulaire multi-étapes (3 steps avec barre de progression, validation Zod + React Hook Form, état partagé). Soigne le design avec les composants shadcn/ui. La constellation Formulaire doit guider ta génération — valide, a11y, responsive, états loading/error/vide. Build vert obligatoire.`,
  },
  {
    id: "C2-tests",
    mode: "elite",
    prompt: `${AUTO}\n\nPhase 2 — tests + sécurité. Complète les tests Vitest sur la validation de chaque étape du formulaire. Ajoute la gestion des erreurs Supabase (toast pour les échecs Auth). Lance les tests, corrige les vrais échecs.`,
  },
  {
    id: "C3-esthetique",
    mode: "esthetique",
    prompt: `${AUTO}\n\nPhase 3 — ✨ Raffinement esthétique. FEATURE FREEZE. Soigne : micro-interactions des étapes (transitions entre steps, animations de validation, focus ring soigné), états d'erreur visuels clairs (rouge/orange accessible), cohérence typographique shadcn, retour visuel au submit. Boucle vision pour vérifier le rendu.`,
  },
  {
    id: "C4-finition",
    mode: "finition",
    prompt: `Phase 4 — 🛡️ Finition. FEATURE FREEZE. QA adversarial : accessibilité clavier complète du formulaire (Tab/Enter/Escape + labels associés), cas limites (champs vides, email invalide, retour à l'étape 1), responsive 320px, gestion de connexion coupée. Consigne le backlog.`,
  },
];

// E — vitrine agence créative, template vitrine (LE projet waouh)
const SPEC_E = `Une vitrine d'agence créative haute couture : hero animé, galerie de projets avec hover reveal, section équipe, testimonials carrousel, formulaire de contact. DA luxe, très soignée. Utilise le moodboard Sharingan pour capturer l'esthétique de 2-3 agences de référence mondiales.`;

const PHASES_E = [
  {
    id: "E1-cadrage",
    mode: "elite",
    prompt: `${AUTO}\n\nNouveau projet VITRINE haute couture. ${SPEC_E}\n\nPhase 1 — cadrage multimodal complet : lance le Sharingan sur 2-3 agences leaders mondiales (ex. Fantasy Interactive, Locomotive, Resn) pour extraire leurs hex/fonts/tokens/ambiance réels. Fais le Miroir visuel (recapitule ce que tu as compris). Construis la structure : hero plein écran avec baseline animée, galerie projets (grille avec hover reveal), section équipe (avatars + rôles), testimonials (carrousel simple), contact (formulaire email). Design de premier niveau — soigne chaque composant. Build vert obligatoire.`,
  },
  {
    id: "E2-esthetique",
    mode: "esthetique",
    prompt: `${AUTO}\n\nPhase 2 — ✨ Raffinement esthétique. C'est LE projet waouh du run — dépasse-toi. FEATURE FREEZE. Déploie l'arsenal complet : micro-interactions exquises (hover avec transform/shadow, scroll reveal avec Intersection Observer, transitions de page fluides), profondeur visuelle (ombres portées multicouches, élévation au hover), tokens CSS granulaires fidèles au moodboard Sharingan (variables --color-*, --radius-*, --shadow-*), typographie très soignée (hiérarchie size/weight/tracking, respect de la charte capturée). Boucle vision intensive — compare au moodboard.`,
  },
  {
    id: "E3-finition",
    mode: "finition",
    prompt: `Phase 3 — 🛡️ Finition parfaite. C'est la vitrine de MangoOS. FEATURE FREEZE. QA adversarial complet : responsive impeccable (320px → 4K, breakpoints soignés), performance (images lazy-loaded, fonts swap, first paint rapide), accessibilité WCAG AA (contrastes vérifiés, focus visible partout, alt textes, role/aria sur le carrousel), formulaire de contact robuste (validation, feedback erreur/succès), edge cases (JS désactivé → contenus critiques visibles). Consigne le backlog.`,
  },
];

// ── Main ──────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  log("\n🌙 ═══════════════════════════════════════════════════════════════════");
  log("   RUN TEST NOCTURNE MangoOS — 2026-06-18");
  log("   5 projets · A/B/D Élève local $0 · C/E Claude Élite→Esthétique→Finition");
  log("═══════════════════════════════════════════════════════════════════════\n");

  // Prérequis
  const [backendOk, ollamaOk] = await Promise.all([checkBackend(), checkOllama()]);
  if (!backendOk) {
    console.error("❌ Backend MangoOS injoignable sur :3000 — lance : cd server && npm run start");
    process.exit(1);
  }
  if (!ollamaOk) {
    console.error("❌ Ollama injoignable sur :11434 — lance : ollama serve");
    process.exit(1);
  }
  log("✓ Backend :3000 OK");
  log("✓ Ollama :11434 OK");

  const state = loadState();
  const results: ProjectResult[] = [];

  // ── LOT ÉLÈVE ──────────────────────────────────────────────────────────────
  log("\n╔══════════════════════════════════════════╗");
  log("║  LOT ÉLÈVE (Gemma 4 12B · $0 · freeStyle)║");
  log("╚══════════════════════════════════════════╝");

  if (!state.done.includes("eleve-portfolio-test")) {
    results.push(await runEleveProject("portfolio-test", "vitrine", TASK_A,
      ["freeStyle → moodboard Sharingan #46/#8", "patrouilleurs a11y/SEO #73", "juge #59"], state));
    fs.writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2));
  } else {
    log("⏭  portfolio-test déjà fait.");
  }

  if (!state.done.includes("eleve-dashboard-test")) {
    results.push(await runEleveProject("dashboard-test", "mantine", TASK_B,
      ["table KPI", "patrouilleurs perf/a11y #73", "auto-réparation build", "mémoire procédurale #75"], state));
    fs.writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2));
  } else {
    log("⏭  dashboard-test déjà fait.");
  }

  if (!state.done.includes("eleve-mini-jeu-test")) {
    results.push(await runEleveProject("mini-jeu-test", "phaser", TASK_D,
      ["jeu 2D canvas Phaser 3", "patrouilleur bundle #73", "freeStyle diversité"], state));
    fs.writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2));
  } else {
    log("⏭  mini-jeu-test déjà fait.");
  }

  // ── LOT CLAUDE ─────────────────────────────────────────────────────────────
  log("\n╔══════════════════════════════════════════════════════╗");
  log("║  LOT CLAUDE (Élite → ✨ Esthétique → 🛡️ Finition)   ║");
  log("╚══════════════════════════════════════════════════════╝");

  // Super-agent UX SaaS senior avant le projet C
  if (!state.done.includes("super-agent-ux-saas")) {
    const agentId = await createSuperAgent(
      "UX SaaS senior",
      "Expert en conception de formulaires SaaS B2B, patterns d'onboarding utilisateur, conversion et accessibilité. Spécialisé React, shadcn/ui, Supabase Auth, Zod, React Hook Form.",
    );
    if (agentId) markDone(state, "super-agent-ux-saas");
  } else {
    log("⏭  Super-agent UX SaaS déjà créé.");
  }

  if (!state.done.includes("claude-saas-contact-test-done") && !nightStopGate().stop) {
    const rC = await runClaudeProject("saas-contact-test", "shadcn", SPEC_C, PHASES_C,
      ["constellation Formulaire #74", "super-agent UX SaaS #40", "Supabase #17", "tests Vitest #24", "patrouilleur sécurité #73", "diff vision #80"], state);
    results.push(rC);
    nightBudgetSpend(rC.costUsd);
    fs.writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2));
    if (rC.buildOk) markDone(state, "claude-saas-contact-test-done");
  } else {
    log("⏭  saas-contact-test déjà fait.");
  }

  if (!state.done.includes("claude-vitrine-showcase-test-done") && !nightStopGate().stop) {
    const rE = await runClaudeProject("vitrine-showcase-test", "vitrine", SPEC_E, PHASES_E,
      ["cadrage multimodal #47", "moodboard Sharingan #46/#8", "constellations #74", "diff vision #80", "LE projet waouh"], state);
    results.push(rE);
    nightBudgetSpend(rE.costUsd);
    fs.writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2));
    if (rE.buildOk) markDone(state, "claude-vitrine-showcase-test-done");
  } else {
    log("⏭  vitrine-showcase-test déjà fait.");
  }

  // ── AUTO-RÉÉCRITURE DES RÈGLES #76 ─────────────────────────────────────────
  log("\n🔄 Analyse d'évolution des règles #76 (passe finale)…");
  let evolutionSummary = "";
  try {
    const idSeed = `showcase-${Date.now().toString(36)}`;
    const ts = new Date().toISOString();
    const evoRun = await runEvolution(WORKSPACE_DIR, idSeed, ts);
    evolutionSummary = `**Run ID** : \`${evoRun.id}\`\n**Résumé** : ${evoRun.summary}\n**Propositions** : ${evoRun.proposals.length}\n\n`;
    for (const p of evoRun.proposals) {
      evolutionSummary += `- [\`${p.kind}\`] **${p.title}** : ${p.rationale.slice(0, 120)}\n`;
    }
    log(`✓ Évolution des règles : ${evoRun.proposals.length} proposition(s) — voir panneau MangoOS > Évolution des règles.`);
  } catch (e) {
    evolutionSummary = `Erreur lors de l'analyse : ${(e as Error).message}`;
    log(`⚠ ${evolutionSummary}`);
  }

  // ── BILAN ───────────────────────────────────────────────────────────────────
  writeBilan(results, evolutionSummary);

  const ok = results.filter((r) => r.buildOk).length;
  const totalCost = results.reduce((s, r) => s + r.costUsd, 0);
  const withScore = results.filter((r) => r.score != null);
  const avgScore = withScore.reduce((s, r) => s + (r.score ?? 0), 0) / Math.max(1, withScore.length);

  log("\n🌅 ═══════════════════════════════════════════════════════════════════");
  log(`   RUN TERMINÉ`);
  log(`   Builds OK    : ${ok}/${results.length}`);
  log(`   Score moyen  : ${avgScore.toFixed(1)}/10`);
  log(`   Coût total   : $${totalCost.toFixed(4)}`);
  log(`   Bilan        : ${BILAN_FILE}`);
  log(`   Résultats    : ${RESULTS_FILE}`);
  log(`   Logs         : ${LOG_FILE}`);
  log("═══════════════════════════════════════════════════════════════════════");
}

main().catch((e) => {
  console.error("❌", e instanceof Error ? e.stack : e);
  process.exit(1);
});
