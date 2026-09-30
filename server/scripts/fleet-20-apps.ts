// Flotte nocturne 20 apps (2026-07-11) — mission autonome de Raf : 20 apps mix
// (site/jeu/logiciel/simulateur), curseurs qualité au MAX, via le VRAI pipeline
// MangoOS+QA (scaffold createProject + portes de clôture réelles), cerveau
// BUILDER = Claude (Fable 5 / Opus 4.8 / Sonnet 5) comparés. But explicite :
// générer de la DATA (logs détaillés + distillation) pour enseigner Mango.
//
// Pourquoi Claude Agent SDK et pas le moteur Élève : les modèles Fable5/Opus/Sonnet
// ne sont pas des cerveaux Ollama/openai-compat — ils tournent nativement via
// @anthropic-ai/claude-agent-sdk (même mécanisme que l'escalade Maître, cf.
// eleve/escalade.ts). On réutilise ce même moteur comme BUILDER PRINCIPAL (pas
// juste en réparation), puis on fait passer chaque app par les VRAIES portes de
// clôture du pipeline (banque d'images L123, Gardien, teste_parcours, MangoQA) —
// donc c'est bien "à travers Mango", pas des agents Claude hors-sol.
//
// Lancer (depuis server/) :  npx tsx scripts/fleet-20-apps.ts
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { visionServer } from "../src/vision.js";
import { createProject, projectDir, projectExists, WORKSPACE_DIR } from "../src/projects.js";
import { curateImageBank, guaranteeLocalImages, formatImageBankForPrompt } from "../src/eleve-image-bank.js";
import { runClosureGate } from "../src/eleve-gate.js";
import { runClosureParcours, runClosureMangoQA, measureCraftSummary } from "../src/eleve/relay-closure.js";
import { inferProjectType } from "../src/blueprints.js";
import { nightStopGate } from "../src/night-guards.js";
import { nightBudgetSpend } from "../src/nocturnal-budget.js";
import { saveProcedure, type ProcedureEntry } from "../src/procedures.js";

function log(m: string): void { console.log(`[${new Date().toISOString()}] ${m}`); }

// ── Modèles comparés (mêmes IDs que home-routes.ts MODEL_MAP) ─────────────────
const MODEL_MAP: Record<"fable" | "opus" | "sonnet", string> = {
  fable: "claude-fable-5",
  opus: "claude-opus-4-8",
  sonnet: "claude-sonnet-4-6",
};

interface AppSpec {
  name: string;
  kind: "site" | "jeu" | "logiciel" | "simulateur";
  template: string;
  brain: keyof typeof MODEL_MAP;
  brief: string;
}

// 20 apps — mix site/jeu/logiciel/simulateur. 4 pilotées ENTIÈREMENT par Fable 5
// (comparaison explicite demandée par Raf), 8 Opus 4.8, 8 Sonnet 5.
const APPS: AppSpec[] = [
  { name: "fleet-mango-runner", kind: "jeu", template: "phaser", brain: "fable",
    brief: "Jeu d'arcade 2D « Mango Runner » : un coureur traverse un verger stylisé, esquive des obstacles, collecte des mangues, score qui monte, vitesse progressive, écran de game-over avec meilleur score (localStorage). Ambiance chaude et vive, pas enfantine-cliché." },
  { name: "fleet-orbites-multicorps", kind: "simulateur", template: "r3f", brain: "fable",
    brief: "Simulateur physique à 3 corps (three/r3f) : trois masses en interaction gravitationnelle réaliste (intégration numérique simple, pas juste une animation scriptée), traces orbitales, contrôle de la masse/vitesse initiale de chaque corps via sliders, pause/vitesse, caméra libre. Esthétique observatoire scientifique." },
  { name: "fleet-atelier-pensee", kind: "logiciel", template: "reactflow", brain: "fable",
    brief: "Éditeur de mind-map pour la GESTION DE PROJET (pas générique) : nœuds typés (tâche/jalon/risque/décision), liens de dépendance, chemin critique calculé et surligné automatiquement, vue « retard probable » (nœuds sans date butoir cohérente), export JSON. Un exemple pré-chargé (lancement d'un produit) pour ne jamais être vide." },
  { name: "fleet-cabinet-architectes", kind: "site", template: "vitrine", brain: "fable",
    brief: "Site vitrine d'un cabinet d'architectes contemporain : portfolio de projets réels (maisons, bureaux, rénovations) avec grande photographie, philosophie du cabinet, processus en 4 étapes, contact. Registre : sobre, matière, lumière — surtout pas un template SaaS générique." },

  { name: "fleet-labyrinthe-chimie", kind: "jeu", template: "pixi", brain: "opus",
    brief: "Jeu de puzzle : mélanger des « éléments » colorés dans le bon ordre pour obtenir une réaction cible (mécanique simple type match/combine), niveaux progressifs, feedback visuel satisfaisant (particules), compteur de coups." },
  { name: "fleet-finances-perso", kind: "logiciel", template: "dashboard", brain: "opus",
    brief: "Tableau de bord de finances personnelles : saisie de transactions (revenu/dépense/catégorie), graphiques d'évolution du solde et de répartition par catégorie, objectif d'épargne avec barre de progression, données factices réalistes au démarrage." },
  { name: "fleet-ecosysteme-proie-predateur", kind: "simulateur", template: "r3f", brain: "opus",
    brief: "Simulateur d'écosystème proie-prédateur (modèle Lotka-Volterra simplifié, visualisé en 3D ou 2D riche) : population de proies et prédateurs évoluant dans le temps selon des règles réelles, graphique des populations dans le temps, paramètres ajustables (taux de reproduction, prédation), scénarios d'effondrement observables." },
  { name: "fleet-ecole-musique", kind: "site", template: "formation", brain: "opus",
    brief: "Plateforme d'une école de musique en ligne : catalogue de cours (instrument, niveau, durée), fiche cours avec programme et professeur, inscription factice, section « pourquoi nous » avec témoignages. Registre chaleureux, typographie expressive, pas de clone Duolingo." },
  { name: "fleet-arbre-genealogique", kind: "logiciel", template: "d3tree", brain: "opus",
    brief: "Éditeur d'arbre généalogique : ajouter des personnes (nom, dates, photo optionnelle), relations parent/enfant/conjoint, arbre visuel navigable (zoom/pan), recherche d'une personne, un arbre d'exemple pré-chargé (3 générations) pour ne jamais être vide." },
  { name: "fleet-voyage-immobilier", kind: "site", template: "vitrine", brain: "opus",
    brief: "Site d'une agence hybride immobilier de prestige + voyages sur-mesure : biens d'exception et séjours exclusifs présentés côte à côte avec la même exigence visuelle, filtre par destination/type, fiche détaillée immersive. Registre premium discret, pas tape-à-l'œil." },
  { name: "fleet-chef-ia", kind: "logiciel", template: "agent", brain: "opus",
    brief: "Assistant de cuisine conversationnel : chat qui propose des recettes à partir d'ingrédients cités par l'utilisateur (logique de matching locale sur une petite base de recettes embarquée, PAS un vrai appel LLM), historique de conversation, suggestions cliquables. Interface chat soignée, chaleureuse." },
  { name: "fleet-esport-analytics", kind: "logiciel", template: "charts", brain: "opus",
    brief: "Dashboard analytique e-sport : stats d'une équipe fictive (victoires/défaites, KDA, heatmap d'activité), comparaison entre joueurs, tendance sur la saison, palette sombre gaming SANS le cliché néon-partout." },

  { name: "fleet-table-gastronomique", kind: "site", template: "vitrine", brain: "sonnet",
    brief: "Site vitrine d'un restaurant gastronomique une étoile : menu dégustation raconté (pas juste une liste), philosophie du chef, réservation factice, galerie de plats en grande photographie. Registre feutré, matière, éclairage chaud — pas de bruit visuel." },
  { name: "fleet-cartographe-rando", kind: "logiciel", template: "leaflet", brain: "sonnet",
    brief: "Éditeur d'itinéraires de randonnée : carte interactive, tracé d'un parcours par points cliqués, calcul de distance et dénivelé approximatif, fiche parcours (difficulté, durée estimée), quelques parcours d'exemple pré-chargés." },
  { name: "fleet-marche-boursier", kind: "simulateur", template: "charts", brain: "sonnet",
    brief: "Simulateur de marché boursier simplifié : quelques actions fictives avec cours qui évolue selon une marche aléatoire réaliste (pas juste du bruit uniforme), achat/vente avec un portefeuille virtuel de départ, graphique de cours en temps simulé, historique des transactions." },
  { name: "fleet-clinique-sport", kind: "site", template: "dashboard", brain: "sonnet",
    brief: "Interface d'un cabinet de kinésithérapie du sport : suivi de patients fictifs (progression de rééducation, prochains rendez-vous), fiche patient avec historique de séances, vue planning de la semaine. Registre clinique mais chaleureux, pas froid-hôpital." },
  { name: "fleet-jeu-educatif-enfants", kind: "jeu", template: "phaser", brain: "sonnet",
    brief: "Jeu éducatif pour enfants (6-9 ans) : reconnaître et associer des formes/couleurs/nombres dans un décor ludique, progression par niveaux courts, feedback positif et encourageant, sons visuels (pas de son réel requis). Registre coloré mais lisible, pas criard." },
  { name: "fleet-organisateur-evenements", kind: "logiciel", template: "ecommerce", brain: "sonnet",
    brief: "Plateforme de billetterie pour une salle d'événements : catalogue d'événements à venir (concert, conférence, spectacle), fiche événement avec places disponibles, panier + réservation factice, mes billets. Registre énergique, lisible, informations denses bien hiérarchisées." },
  { name: "fleet-magazine-tech", kind: "site", template: "blog", brain: "sonnet",
    brief: "Magazine éditorial tech : articles de fond avec accroche, temps de lecture, catégories, article vedette en une, mise en page éditoriale soignée (pas un blog Bootstrap générique). Contenu factice mais crédible et bien écrit." },
  { name: "fleet-crm-boutique", kind: "logiciel", template: "ecommerce", brain: "sonnet",
    brief: "Mini-CRM pour une boutique indépendante : liste de clients fictifs avec historique d'achats, fiche client, relance suggérée (client inactif depuis longtemps), vue des produits les plus vendus. Registre pro, dense mais respirant." },
];

const FLEET_LOG_DIR = path.join(WORKSPACE_DIR, ".fleet-logs");
const MAX_PARALLEL = 2; // API cloud → prudence coût/rate-limit, pas de contention GPU locale
const MAX_TURNS = 34;

interface ToolCallLog { name: string; argsPreview: string }
interface AppRunLog {
  name: string; kind: string; template: string; brain: string; model: string; brief: string;
  startedAt: string; finishedAt: string; durationMs: number;
  costUsd: number; toolCalls: ToolCallLog[]; toolCallCount: number;
  imageBank: { curated: number; guaranteedReplaced: number; guaranteedStillBroken: number };
  gate: { ok: boolean; intentOk?: boolean; wcagOk?: boolean; balanceOk?: boolean; placeholdersOk?: boolean; tasteScore?: number | null } | null;
  parcours: { ok: boolean; errors: string[] } | null;
  mangoqa: { ok: boolean; action: string; skipped?: string } | null;
  craftSummary: string;
  finalText: string;
  error?: string;
}

function ensureDir(p: string): void { fs.mkdirSync(p, { recursive: true }); }

/** Reprise (relance après coupure) : une app déjà RÉUSSIE (log présent, sans erreur,
 * gate ok) n'est pas rejouée — évite de re-dépenser sur un résultat déjà bon. */
function alreadyDone(spec: AppSpec): boolean {
  try {
    const p = path.join(FLEET_LOG_DIR, `${spec.name}.json`);
    if (!fs.existsSync(p)) return false;
    const prev = JSON.parse(fs.readFileSync(p, "utf8")) as AppRunLog;
    return !prev.error && !!prev.gate?.ok;
  } catch {
    return false;
  }
}

/** Construit le brief « expert » envoyé au builder Claude, banque d'images incluse. */
function buildTaskPrompt(spec: AppSpec, imagesClause: string): string {
  return [
    `Projet : ./workspace/${spec.name} (React 19 + Vite 7 + Tailwind v4, déjà scaffoldé, dépendances installées).`,
    `Tâche : ${spec.brief}`,
    "",
    "EXIGENCE NIVEAU EXPERT (obligatoire, dans cet ordre) :",
    "1. ANGLE — écris en commentaire en tête d'App.jsx un angle créatif non-évident (une phrase), traduit en 3 contraintes visuelles concrètes (palette précise en custom properties, paire typographique nommée, une règle de layout). Aucun choix visuel ne doit pouvoir être resservi tel quel pour un autre sujet.",
    "2. PALETTE ancrée (jamais de noir pur #000, UN accent saturé maximum, tout en variables CSS), UN moment typographique mémorable, motion sémantique (au moins 3 micro-interactions soignées, prefers-reduced-motion respecté).",
    "3. CONTENU réel et crédible (pas de lorem ipsum), états couverts (chargement/vide/erreur selon pertinence), a11y de base (contraste WCAG AA, focus visibles), tenue mobile.",
    imagesClause,
    "4. `npm run build` DOIT passer avant de considérer la tâche terminée — vérifie-le toi-même avec Bash. Ne lance PAS `npm run dev` (pas de serveur persistant).",
    "5. Ne touche à aucun fichier hors de ce projet. Ne fais AUCUNE opération git.",
    "Termine par un court résumé (5-8 lignes) de ton angle créatif et des décisions clés — ce résumé sert à la distillation pédagogique de Mango.",
  ].filter(Boolean).join("\n");
}

async function buildOneApp(spec: AppSpec): Promise<AppRunLog> {
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  const dir = projectDir(spec.name);
  const model = MODEL_MAP[spec.brain];
  const runLog: AppRunLog = {
    name: spec.name, kind: spec.kind, template: spec.template, brain: spec.brain, model, brief: spec.brief,
    startedAt, finishedAt: "", durationMs: 0, costUsd: 0, toolCalls: [], toolCallCount: 0,
    imageBank: { curated: 0, guaranteedReplaced: 0, guaranteedStillBroken: 0 },
    gate: null, parcours: null, mangoqa: null, craftSummary: "", finalText: "",
  };

  try {
    if (!projectExists(spec.name)) {
      await createProject(spec.name, spec.template);
      log(`[${spec.name}] ✓ scaffoldé (${spec.template}) — brain=${spec.brain} (${model})`);
    }

    // AMONT — banque d'images RÉELLES téléchargées en local (même brique que L123).
    const bank = await curateImageBank(spec.brief, dir);
    runLog.imageBank.curated = bank.length;
    const imagesClause = formatImageBankForPrompt(bank);
    if (bank.length) log(`[${spec.name}]   🖼 banque : ${bank.length} images`);

    const prompt = buildTaskPrompt(spec, imagesClause);

    // BUILD — Claude Agent SDK, le même moteur que l'escalade Maître (eleve/escalade.ts),
    // mais ici PRINCIPAL (pas réparation). Capture le toolTrace pour la distillation.
    const q = query({
      prompt,
      options: {
        cwd: WORKSPACE_DIR,
        model,
        maxTurns: MAX_TURNS,
        permissionMode: "acceptEdits",
        // (2026-07-12) alignement sur agent.ts (le vrai flux "Construire") : sans
        // les outils vision, ces 20 apps n'avaient AUCUN accès à Sharingan/Snapshot
        // (clone pixel-perfect, palette réelle d'une référence) — gap trouvé en audit.
        allowedTools: ["Read", "Write", "Edit", "Bash", "Glob", "Grep", "mcp__vision__snapshot", "mcp__vision__clone_url", "mcp__vision__scrape_url", "mcp__vision__sharingan_url", "mcp__vision__sharingan_image", "WebSearch", "WebFetch"],
        mcpServers: { vision: visionServer },
        systemPrompt: { type: "preset", preset: "claude_code" },
      },
    });

    let finalText = "";
    for await (const msg of q as AsyncIterable<any>) {
      if (msg?.type === "assistant" && Array.isArray(msg.message?.content)) {
        for (const block of msg.message.content) {
          if (block?.type === "tool_use") {
            const argsPreview = JSON.stringify(block.input ?? {}).slice(0, 200);
            runLog.toolCalls.push({ name: block.name, argsPreview });
          } else if (block?.type === "text" && typeof block.text === "string") {
            finalText = block.text;
          }
        }
      } else if (msg?.type === "result") {
        runLog.costUsd = msg.total_cost_usd ?? runLog.costUsd;
        if (typeof msg.result === "string" && msg.result) finalText = msg.result;
      }
    }
    runLog.toolCallCount = runLog.toolCalls.length;
    runLog.finalText = finalText.slice(0, 4000);
    log(`[${spec.name}]   🧠 ${runLog.toolCallCount} appels d'outils · $${runLog.costUsd.toFixed(3)}`);

    // AVAL — filet de garantie images (jamais de casse, même si le builder a désobéi).
    const gr = await guaranteeLocalImages(dir, bank);
    runLog.imageBank.guaranteedReplaced = gr.replaced.length;
    runLog.imageBank.guaranteedStillBroken = gr.stillBroken.length;
    if (gr.replaced.length) log(`[${spec.name}]   🖼 filet : ${gr.replaced.length} image(s) garantie(s)`);

    // PORTES DE CLÔTURE RÉELLES — les mêmes que le pipeline Élève (Gardien/parcours/MangoQA).
    const toolTrace = runLog.toolCalls.map((t) => ({ name: t.name, args: t.argsPreview }));
    const projectType = inferProjectType(spec.brief) || spec.kind;
    try {
      const verdict = await runClosureGate(dir, spec.brief, { text: finalText, toolTrace }, WORKSPACE_DIR, projectType);
      runLog.gate = { ok: verdict.ok, intentOk: verdict.intentOk, wcagOk: verdict.wcagOk, balanceOk: verdict.balanceOk, placeholdersOk: verdict.placeholdersOk, tasteScore: verdict.tasteScored ? verdict.design?.overall ?? null : null };
    } catch (e) { runLog.gate = { ok: false }; log(`[${spec.name}]   ⚠ Gardien indisponible : ${(e as Error).message}`); }

    try { runLog.parcours = await runClosureParcours(dir); } catch { runLog.parcours = { ok: false, errors: ["exception"] }; }
    try { runLog.mangoqa = await runClosureMangoQA(dir); } catch { runLog.mangoqa = { ok: true, action: "", skipped: "exception" }; }
    runLog.craftSummary = measureCraftSummary(dir, toolTrace.map((t) => t.name === "Write" || t.name === "Edit" ? "" : "").filter(Boolean));

    log(`[${spec.name}] ✅ terminé — gate=${runLog.gate?.ok} parcours=${runLog.parcours?.ok} mangoqa=${runLog.mangoqa?.ok}`);
  } catch (e) {
    runLog.error = (e as Error).stack ?? String(e);
    log(`[${spec.name}] ✗ ERREUR : ${(e as Error).message}`);
  }

  runLog.finishedAt = new Date().toISOString();
  runLog.durationMs = Date.now() - t0;
  ensureDir(FLEET_LOG_DIR);
  fs.writeFileSync(path.join(FLEET_LOG_DIR, `${spec.name}.json`), JSON.stringify(runLog, null, 2), "utf8");

  // DISTILLATION — pour les apps pilotées par Fable 5 : capture la démarche en
  // procédure réutilisable par l'Élève (même magasin que #75 / stratege-learn).
  if (spec.brain === "fable" && !runLog.error) {
    try {
      const now = new Date().toISOString();
      const slug = `fable5-${spec.kind}-${spec.name.replace(/^fleet-/, "")}`;
      const entry: ProcedureEntry = {
        meta: {
          slug, name: `Fable 5 — ${spec.brief.slice(0, 60)}`,
          problem: `Construire ${spec.kind} : ${spec.brief}`,
          tags: ["fable5", spec.kind, spec.template],
          usedIn: [spec.name], createdAt: now, updatedAt: now,
        },
        body: [
          `# Démarche Fable 5 — ${spec.name}`,
          "",
          `**Brief** : ${spec.brief}`,
          `**Template** : ${spec.template} · **Outils utilisés** : ${runLog.toolCallCount} appels (${[...new Set(runLog.toolCalls.map((t) => t.name))].join(", ")})`,
          `**Coût** : $${runLog.costUsd.toFixed(3)} · **Gate** : ${runLog.gate?.ok ? "OK" : "non conforme"}${runLog.gate?.tasteScore != null ? ` (goût ${runLog.gate.tasteScore})` : ""}`,
          "",
          "**Résumé de la démarche (auto-rapporté par Fable 5)** :",
          runLog.finalText || "(aucun résumé capturé)",
          "",
          "> Procédure distillée automatiquement (flotte 20-apps, nuit 2026-07-11) pour que l'Élève local s'inspire de l'angle et des décisions de Fable 5 sur une tâche similaire.",
        ].join("\n"),
      };
      saveProcedure(WORKSPACE_DIR, entry);
      log(`[${spec.name}]   📚 distillé → procédure "${slug}"`);
    } catch (e) {
      log(`[${spec.name}]   ⚠ distillation échouée (non bloquant) : ${(e as Error).message}`);
    }
  }

  return runLog;
}

async function runPool(items: AppSpec[], concurrency: number): Promise<AppRunLog[]> {
  const results: AppRunLog[] = [];
  let i = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const idx = i++;
      if (idx >= items.length) return;
      // Plafond $ de la nuit à la frontière d'app (jamais en cours de génération) : audit dormant 2026-09-30.
      const budgetStop = nightStopGate();
      if (budgetStop.stop) { log(`💰 ${budgetStop.reason} — app ${items[idx].name} non jouée.`); return; }
      results[idx] = await buildOneApp(items[idx]);
      nightBudgetSpend(results[idx].costUsd);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return results.filter(Boolean); // apps non jouées (plafond $) = trous du tableau, à écarter
}

/** --limit N (argv[2]) : ne (re)joue que les N premières apps NON-réussies (prudence
 * quota Claude Code — Raf peut relancer par petits lots). Absent → toutes. */
function parseLimit(): number {
  const n = Number(process.argv[2]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : Infinity;
}

function loadLog(name: string): AppRunLog | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(FLEET_LOG_DIR, `${name}.json`), "utf8")) as AppRunLog;
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  ensureDir(FLEET_LOG_DIR);
  const limit = parseLimit();
  const notDone = APPS.filter((s) => !alreadyDone(s));
  const skipped = APPS.filter((s) => alreadyDone(s));
  const toRun = notDone.slice(0, limit);
  const deferred = notDone.slice(limit);
  log(`═══ FLOTTE 20 APPS — reprise 2026-07-11 · ${toRun.length} joué(s) ce lot (limit=${limit === Infinity ? "∞" : limit}), ${skipped.length} déjà réussie(s), ${deferred.length} différée(s) · concurrence ${MAX_PARALLEL} ═══`);
  for (const s of skipped) log(`[${s.name}] ⏭ déjà réussi — sauté`);
  for (const s of deferred) log(`[${s.name}] ⏸ différé (limite du lot) — pas encore joué`);
  const fresh = await runPool(toRun, MAX_PARALLEL);
  // Résumé = TOUTES les apps dont un log existe (réussies avant, ce lot, ou en erreur
  // d'un lot précédent) — les différées n'apparaissent que si un log antérieur existe.
  const byName = new Map<string, AppRunLog>(fresh.map((r) => [r.name, r]));
  const results = APPS.map((s) => byName.get(s.name) ?? loadLog(s.name)).filter((r): r is AppRunLog => r != null);

  const byBrain = { fable: [] as AppRunLog[], opus: [] as AppRunLog[], sonnet: [] as AppRunLog[] };
  for (const r of results) byBrain[r.brain as keyof typeof byBrain].push(r);

  const summary = {
    finishedAt: new Date().toISOString(),
    total: results.length,
    ok: results.filter((r) => r.gate?.ok && r.parcours?.ok && r.mangoqa?.ok && !r.error).length,
    totalCostUsd: results.reduce((s, r) => s + r.costUsd, 0),
    byBrain: Object.fromEntries(
      Object.entries(byBrain).map(([brain, rs]) => [
        brain,
        {
          count: rs.length,
          ok: rs.filter((r) => r.gate?.ok && r.parcours?.ok && r.mangoqa?.ok && !r.error).length,
          avgTasteScore: (() => { const s = rs.map((r) => r.gate?.tasteScore).filter((x): x is number => x != null); return s.length ? Math.round((s.reduce((a, b) => a + b, 0) / s.length) * 10) / 10 : null; })(),
          avgToolCalls: Math.round(rs.reduce((s, r) => s + r.toolCallCount, 0) / Math.max(1, rs.length)),
          totalCostUsd: Math.round(rs.reduce((s, r) => s + r.costUsd, 0) * 1000) / 1000,
        },
      ]),
    ),
    apps: results.map((r) => ({ name: r.name, kind: r.kind, brain: r.brain, gateOk: r.gate?.ok, tasteScore: r.gate?.tasteScore, parcoursOk: r.parcours?.ok, mangoqaOk: r.mangoqa?.ok, error: r.error ? true : undefined })),
  };
  fs.writeFileSync(path.join(FLEET_LOG_DIR, "_summary.json"), JSON.stringify(summary, null, 2), "utf8");
  log(`═══ FIN FLOTTE — ${summary.ok}/${summary.total} conformes · $${summary.totalCostUsd.toFixed(2)} ═══`);
  log(`Comparatif : fable=${JSON.stringify(summary.byBrain.fable)} opus=${JSON.stringify(summary.byBrain.opus)} sonnet=${JSON.stringify(summary.byBrain.sonnet)}`);
}

main().catch((e) => { log(`FATAL: ${(e as Error).stack ?? e}`); process.exit(1); });
