// Driver de la session de test « jeu 2D » (plan-test-jeu-2d.md) — CLI autonome,
// JAMAIS importé en prod. Pilote le backend MangoOS (/api/chat, SSE) pour bâtir
// un produit complet et mesurer l'apport de la pile de capacités.
//
// A/B CONTRÔLÉ : même modèle (sonnet) pour les deux builds ; seule variable = le
// MODE (elite-full + finition  vs  mvp nu). Ce qui diffère = la pile Mango.
//
// Résumable : chaque phase réussie est marquée dans un fichier d'état ; relancer
// reprend là où ça s'est arrêté. Le sessionId est enchaîné entre phases d'un
// même build pour garder le contexte (plan, lexique, Miroir).
//
// Lancer :
//   npx tsx src/drive-game-test.ts --build B        # baseline MVP (rapide, contrôle)
//   npx tsx src/drive-game-test.ts --build A        # Élite-full → Finition
//   npx tsx src/drive-game-test.ts --build A --from 3   # reprendre à la phase 3

import fs from "node:fs";
import path from "node:path";
import { WORKSPACE_DIR } from "../src/projects.js";

const BASE = process.env.MANGO_URL ?? "http://localhost:3000";
const MODEL = process.env.TEST_MODEL ?? "sonnet"; // identique A et B (contrôle)

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

interface Phase {
  id: string;
  mode: "mvp" | "elite" | "finition";
  prompt: string;
}

// Consigne d'autonomie injectée dans chaque prompt Élite : ne pas bloquer aux
// portes de validation (Mango Plan, Le Miroir) en session non-interactive.
const AUTO = `IMPORTANT : session autonome, NE me pose AUCUNE question. Prends toutes les décisions toi-même avec des défauts ÉNONCÉS brièvement, puis construis directement. Réponds "vas-y avec ton jugement" à tes propres questions de cadrage.`;

const SPEC = `« Mango Crypt » — roguelike 2D top-down façon Zelda (React + Vite + Tailwind v4). Déplacement 4/8 directions sur grille de tuiles avec collisions ; donjon PROCÉDURAL de salles reliées par des portes (run-based, permadeath, seed) ; combat temps réel (attaque mêlée, hitbox, I-frames, knockback) ; ennemis IA patrouille→poursuite + boss d'étage ; HP en cœurs + stamina ; loot (clés, cœurs, pièces, relique) + inventaire ; minimap + brouillard par salle ; écran d'accueil, écran de résumé de run, meilleur score en localStorage.`;

// ── Build A : Élite-full, phase par phase, jusqu'à la Finition ────────────────
const BUILD_A: Phase[] = [
  {
    id: "A1-cadrage-coeur",
    mode: "elite",
    prompt: `${AUTO}\n\nNouveau projet de JEU. ${SPEC}\n\nPhase 1 — cadrage + cœur jouable : fais le cadrage fondateur (contrat de langage du domaine jeu : player, heart, room, tile, mob, loot, run, seed… ; références d'ambiance pixel-art ; Miroir de ce que tu as compris en une ligne), écris plan.md (entités Player/Room/Mob/Item/Run, features priorisées, arborescence cible), PUIS construis le CŒUR JOUABLE qui tourne : tilemap, déplacement du joueur avec collisions, boucle de jeu, une salle de test. Vérifie le rendu visuellement.`,
  },
  {
    id: "A2-combat",
    mode: "elite",
    prompt: `${AUTO}\n\nPhase 2 — combat. Ajoute l'attaque mêlée du joueur (hitbox devant lui), les I-frames + knockback, les dégâts, la mort du joueur (game over). Soigne le game feel (feedback de coup). Tests Vitest sur la logique pure de combat (dégâts, I-frames).`,
  },
  {
    id: "A3-donjon",
    mode: "elite",
    prompt: `${AUTO}\n\nPhase 3 — donjon procédural. Génère un donjon de plusieurs salles reliées par des portes à partir d'un SEED (reproductible), navigation de salle en salle, minimap avec salles découvertes, brouillard par salle. Tests Vitest sur le générateur (déterminisme par seed, connexité des salles).`,
  },
  {
    id: "A4-ennemis-loot-hud",
    mode: "elite",
    prompt: `${AUTO}\n\nPhase 4 — ennemis, loot, HUD, boucle de run. Ajoute : ennemis avec IA patrouille→poursuite + spawn par salle + un boss d'étage ; loot (clés pour portes verrouillées, cœurs de soin, pièces, une relique qui change une stat) + inventaire ; HUD diegetic (cœurs, stamina, pièces, clés) ; écran d'accueil, écran de résumé de run (permadeath), meilleur score en localStorage. Vérifie le rendu.`,
  },
  {
    id: "A5-tests",
    mode: "elite",
    prompt: `${AUTO}\n\nPhase 5 — couverture de tests. Complète les tests Vitest de toute la logique PURE non encore couverte : collisions, pathfinding/IA, RNG du loot, calcul de score. Lance la suite et corrige les vrais échecs.`,
  },
  {
    id: "A6-finition",
    mode: "finition",
    prompt: `Passe ce jeu en phase de FINITION. Gèle les features (n'en ajoute aucune). Lance le QA adversarial obligatoire, puis durcis : cas limites (seed extrême, 0 ennemi, inventaire plein, HP à 1), états loading/empty/error, accessibilité clavier (le jeu doit être 100% jouable au clavier + focus visibles dans les menus), responsive (cadre du jeu qui tient sur mobile), liens/inputs sûrs. Élargis les tests sur la logique critique. Consigne le backlog des décisions restantes.`,
  },
];

// ── Build B : baseline MVP, nu (contrôle) ────────────────────────────────────
const BUILD_B: Phase[] = [
  {
    id: "B1-mvp",
    mode: "mvp",
    prompt: `Nouveau projet de JEU, va au plus direct. ${SPEC}\n\nConstruis le jeu le plus complet possible, directement.`,
  },
  {
    id: "B2-mvp-suite",
    mode: "mvp",
    prompt: `Complète le jeu : tout ce qui manque de la spec (donjon procédural multi-salles, combat avec I-frames, ennemis IA + boss, loot + inventaire, minimap, écran de résumé de run, meilleur score localStorage). Va au plus direct.`,
  },
];

interface PhaseResult {
  id: string;
  mode: string;
  ok: boolean;
  costUsd: number;
  numTurns: number;
  error?: string;
  textLen: number;
  tools: number;
  ms: number;
}

async function runPhase(
  projectName: string,
  phase: Phase,
  sessionId: string | undefined,
  logPath: string,
): Promise<{ result: PhaseResult; sessionId: string | undefined }> {
  const started = Date.now();
  const body = { prompt: phase.prompt, projectName, model: MODEL, mode: phase.mode, sessionId };
  const res = await fetch(`${BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) {
    const result: PhaseResult = { id: phase.id, mode: phase.mode, ok: false, costUsd: 0, numTurns: 0, error: `HTTP ${res.status}`, textLen: 0, tools: 0, ms: Date.now() - started };
    return { result, sessionId };
  }

  let newSession = sessionId;
  let costUsd = 0, numTurns = 0, textLen = 0, tools = 0, ok = false, error: string | undefined;
  const log = (line: string) => fs.appendFileSync(logPath, line + "\n");

  // SSE: lit le flux ligne par ligne, parse les "data: {...}".
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
      const line = part.split("\n").find((l) => l.startsWith("data: "));
      if (!line) continue;
      let ev: any;
      try { ev = JSON.parse(line.slice(6)); } catch { continue; }
      switch (ev.type) {
        case "status": log(`  · ${ev.text}`); break;
        case "preview": log(`  · preview ${ev.url}`); break;
        case "thinking": break;
        case "text": textLen += (ev.text?.length ?? 0); if (ev.text?.trim()) log(`  💬 ${ev.text.trim().slice(0, 200)}`); break;
        case "tool": tools++; log(`  🔧 ${ev.name} ${String(ev.detail ?? "").slice(0, 100)}`); break;
        case "result":
          ok = !!ev.ok; costUsd = ev.costUsd ?? 0; numTurns = ev.numTurns ?? 0;
          error = ev.error; if (ev.sessionId) newSession = ev.sessionId;
          break;
        case "error": error = ev.message; log(`  ❌ ${ev.message}`); break;
      }
    }
  }

  const result: PhaseResult = { id: phase.id, mode: phase.mode, ok, costUsd, numTurns, error, textLen, tools, ms: Date.now() - started };
  return { result, sessionId: newSession };
}

async function main(): Promise<void> {
  const build = (arg("build") ?? "B").toUpperCase();
  const from = Number(arg("from") ?? 1);
  const phases = build === "A" ? BUILD_A : BUILD_B;
  const projectName = build === "A" ? "mango-crypt-elite" : "mango-crypt-mvp";
  const statePath = path.join(WORKSPACE_DIR, `.game-test.${build}.state.json`);
  const logPath = path.join(WORKSPACE_DIR, `.game-test.${build}.log`);
  const resultsPath = path.join(WORKSPACE_DIR, `.game-test.${build}.results.jsonl`);

  let state: { sessionId?: string; done: string[] } = { done: [] };
  try { state = JSON.parse(fs.readFileSync(statePath, "utf8")); } catch { /* fresh */ }

  fs.appendFileSync(logPath, `\n\n===== BUILD ${build} (${projectName}, modèle ${MODEL}) @ ${new Date().toISOString()} =====\n`);
  console.log(`🎮 Build ${build} — projet « ${projectName} », modèle ${MODEL}, ${phases.length} phases.`);

  let sessionId = state.sessionId;
  for (let i = 0; i < phases.length; i++) {
    if (i + 1 < from) continue;
    const phase = phases[i];
    if (state.done.includes(phase.id)) { console.log(`⏭  [${phase.id}] déjà fait, saute.`); continue; }

    console.log(`\n▶ [${i + 1}/${phases.length}] ${phase.id} (mode ${phase.mode})…`);
    fs.appendFileSync(logPath, `\n--- ${phase.id} (${phase.mode}) ---\n`);
    const { result, sessionId: ns } = await runPhase(projectName, phase, sessionId, logPath);
    sessionId = ns;
    fs.appendFileSync(resultsPath, JSON.stringify({ ...result, ts: new Date().toISOString() }) + "\n");

    const tag = result.ok ? "✅" : "❌";
    console.log(`${tag} ${phase.id} — turns:${result.numTurns} tools:${result.tools} $${result.costUsd.toFixed(4)} ${(result.ms / 1000).toFixed(0)}s ${result.error ? "ERR:" + result.error : ""}`);

    if (result.ok) state.done.push(phase.id);
    state.sessionId = sessionId;
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2));

    if (!result.ok) { console.log(`⚠ Phase en échec — arrêt pour inspection (reprendre avec --from ${i + 1}).`); break; }
  }
  console.log(`\n🏁 Build ${build} : ${state.done.length}/${phases.length} phases OK. Log: ${logPath}`);
}

main().catch((e) => { console.error("❌", e instanceof Error ? e.stack : e); process.exit(1); });
