// Sonde de chaos EN RÉEL (#196 fault-finding Partie 5, plan run-login-cached-noodle.md).
//
// Objectif : vérifier que les Parties 0-3 de ce plan (dataDir unifié, registre
// d'intégrité, registre de livraison étendu, superviseur de process) COMPOSENT
// correctement en système, pas seulement individuellement. Découverte en
// construisant ce script : le verrou global d'agent (agent-lock.ts,
// `tryAcquireAgent`) interdit DÉJÀ structurellement les tours de chat parallèles
// — la « concurrence » réellement à risque dans cette architecture n'est donc
// pas plusieurs tours simultanés (impossible par construction), mais :
//   1. le rejet correct du verrou lui-même (regression-lock : un 2e tour
//      pendant qu'un 1er tourne doit toujours recevoir 409, jamais démarrer) ;
//   2. un crash RÉEL en plein tour, composé avec la relance AUTOMATIQUE du
//      watchdog (Partie 3) — le tour interrompu doit rester marqué "running"
//      (jamais silencieusement résolu par le redémarrage) et aucun AUTRE store
//      ne doit perdre de données pendant tout le cycle crash→relance.
//
// Isolation : instance dédiée (port séparé, sentinelle/log dédiés — jamais le
// backend vivant de la session sur le port 3000). Un SEUL projet jetable est
// créé dans le vrai `workspace/` (aucun moyen d'isoler ce répertoire sans
// modifier projects.ts en profondeur — hors scope), nommé sans ambiguïté.
// Volontairement JAMAIS supprimé automatiquement en fin de run (contrairement
// à l'intention initiale) : la 1ère création traverse `createProject` (npm
// install RÉEL, plusieurs secondes) AVANT que `startTurn` ne pose l'ancre —
// une suppression systématique aurait fait retraverser ce chemin lent à
// CHAQUE run, rendant le timing du kill non fiable (constaté en vérif live,
// 2026-07-23 : le kill tombait pendant le scaffolding, jamais pendant le tour
// ledgé). Le projet persiste entre les runs comme fixture réutilisable.
//
// Exécution : npx tsx src/regression/chaos-runner.ts   (PAS `npm test` — vrais
// process, vrai crash, vrai réseau local ; même tier logique que
// `probe-fault-corpus.ts` côté MangoQA : une sonde réelle, pas un test CI).
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { heartbeatAgeMs, isHeartbeatStale, DEFAULT_STALE_THRESHOLD_MS } from "../watchdog-core.js";
import { dataDir } from "../safe-io.js";
import { WORKSPACE_DIR } from "../projects.js";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const PORT = Number(process.env.CHAOS_PORT ?? 3098);
const BASE = `http://localhost:${PORT}`;
const BACKEND_HEARTBEAT_FILE = path.join(ROOT, ".chaos-backend-active");
const WATCHDOG_LOG_FILE = path.join(ROOT, "chaos-watchdog.log");
const PROJECT_NAME = "chaos-probe-nightly";
const REPORT_FILE = process.env.REGRESSION_REPORT_FILE ?? dataDir("regression-report.json");

interface ChaosReport {
  ranAt: string;
  mangoQa: { alive: boolean; ageMs: number | null; note: string };
  lockRejection: { pass: boolean; detail: string };
  crashRecovery: { pass: boolean; detail: string };
  integrity: { pass: boolean; findings: unknown[] };
  overallPass: boolean;
}

function log(msg: string): void {
  console.log(`[chaos] ${msg}`);
}

async function waitForUp(timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${BASE}/api/turn-status/${PROJECT_NAME}`);
      if (r.status === 200 || r.status === 404) return true;
    } catch {
      /* pas encore prêt */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

/** Lit le VRAI statut du ledger. Contrat réel de la route (turn-ledger.ts) :
 *  `{ entry: TurnLedgerEntry | null, deferred: [] }` — PAS `{ status }` à plat.
 *  `entry === null` si le projet n'existe pas encore (jamais un 404). */
async function readLedgerEntryStatus(): Promise<string | null> {
  try {
    const r = await fetch(`${BASE}/api/turn-status/${PROJECT_NAME}`);
    if (!r.ok) return null;
    const data = (await r.json()) as { entry?: { status?: string } | null };
    return data.entry?.status ?? null;
  } catch {
    return null;
  }
}

/** Poll jusqu'à ce que le ledger affiche RÉELLEMENT "running" — plus fiable
 *  qu'un délai fixe : la 1ère création de projet traverse `createProject`
 *  (npm install RÉEL) AVANT que `startTurn` ne pose l'ancre, donc un délai
 *  fixe court peut tomber AVANT que le ledger n'existe même (constaté en
 *  vérif live). Ce poll garantit que le kill suivant tombe vraiment en plein
 *  tour ledgé, jamais pendant le scaffolding. */
async function waitForLedgerRunning(timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((await readLedgerEntryStatus()) === "running") return true;
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

function checkMangoQaLiveness(): ChaosReport["mangoQa"] {
  // Même source que la production : isMangoQaActive() (mangoqa.ts) dérive le
  // chemin de WORKSPACE_DIR (projects.js), pas d'une variable d'env côté
  // MangoOS — MANGOAI_WORKSPACE n'existe QUE dans le .env de MangoQA (repo
  // séparé), une confusion trouvée en vérif live (2026-07-23).
  const sentinel = path.join(WORKSPACE_DIR, ".mangoqa-active");
  let raw: string | null = null;
  try {
    raw = fs.readFileSync(sentinel, "utf8");
  } catch {
    raw = null;
  }
  const age = heartbeatAgeMs(raw, Date.now());
  const stale = isHeartbeatStale(age, DEFAULT_STALE_THRESHOLD_MS);
  return {
    alive: !stale,
    ageMs: age === Infinity ? null : age,
    note: stale
      ? "MangoQA MORT ou sentinelle périmée pendant cette sonde — les phases de build de cette session n'ont PAS été auditées, à signaler explicitement (#196 Partie 4.2)."
      : "MangoQA vivant (sentinelle fraîche).",
  };
}

function findPidFromHeartbeat(): number | null {
  try {
    const raw = fs.readFileSync(BACKEND_HEARTBEAT_FILE, "utf8");
    const parsed = JSON.parse(raw) as { pid?: number };
    return typeof parsed.pid === "number" ? parsed.pid : null;
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  console.log("═".repeat(72));
  console.log("Sonde de chaos — composition Parties 0-3 (#196 fault-finding Partie 5)");
  console.log("═".repeat(72));

  fs.rmSync(BACKEND_HEARTBEAT_FILE, { force: true });
  fs.rmSync(WATCHDOG_LOG_FILE, { force: true });

  const mangoQa = checkMangoQaLiveness();
  log(`MangoQA : ${mangoQa.note}`);

  log(`démarrage de l'instance isolée sous watchdog (port ${PORT})…`);
  const watchdog: ChildProcess = spawn(
    process.execPath,
    [path.join(ROOT, "node_modules", "tsx", "dist", "cli.mjs"), path.join(ROOT, "src", "watchdog.ts")],
    {
      cwd: ROOT,
      stdio: "inherit",
      env: {
        ...process.env,
        PORT: String(PORT),
        HOST: "localhost",
        BACKEND_HEARTBEAT_FILE,
        WATCHDOG_LOG_FILE,
      },
    },
  );

  const report: ChaosReport = {
    ranAt: new Date().toISOString(),
    mangoQa,
    lockRejection: { pass: false, detail: "non exécuté" },
    crashRecovery: { pass: false, detail: "non exécuté" },
    integrity: { pass: false, findings: [] },
    overallPass: false,
  };

  try {
    const up = await waitForUp(20_000);
    if (!up) throw new Error("instance isolée jamais démarrée (timeout 20s)");
    log("instance isolée prête.");

    // Snapshot d'intégrité AVANT chaos (établit le premier snapshot si absent).
    await fetch(`${BASE}/api/integrity/audit`, { method: "POST" });

    // ── 1er tour : prompt volontairement bavard (pas juste "OK") pour laisser une
    // fenêtre confortable où le ledger est "running" — un 1-mot peut résoudre plus
    // vite que le poll qui suit ne l'observe une seule fois.
    log("lance un 1er tour (intention discuter, coût minimal, sovereign glm-5.2:cloud)…");
    const firstTurn = fetch(`${BASE}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: "Écris un paragraphe de 5 phrases sur l'importance des tests automatisés dans un logiciel, en français.",
        projectName: PROJECT_NAME,
        intention: "discuter",
      }),
    }).catch(() => null);

    const trulyRunning = await waitForLedgerRunning(60_000);
    if (!trulyRunning) throw new Error("le ledger n'est jamais passé à \"running\" (startTurn jamais atteint — projet toujours en scaffolding après 60s ?)");
    log("  ledger confirmé \"running\" — le tour est réellement en vol.");

    // ── 1. Verrou global — un 2e tour pendant qu'un 1er tourne doit être rejeté ──
    const second = await fetch(`${BASE}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "second tour", projectName: PROJECT_NAME, intention: "discuter" }),
    });
    report.lockRejection = {
      pass: second.status === 409,
      detail: `2e tour pendant le 1er (ledger confirmé "running") → HTTP ${second.status} (attendu 409)`,
    };
    log(`  ${report.lockRejection.pass ? "✅" : "❌"} ${report.lockRejection.detail}`);

    // ── 2. Crash réel en plein tour + relance auto + honnêteté du ledger ────────
    log("kill du process enfant en plein 1er tour (SIGKILL réel, ledger confirmé running)…");
    const pidBefore = findPidFromHeartbeat();
    if (pidBefore) {
      try {
        process.kill(pidBefore, "SIGKILL");
      } catch {
        /* déjà mort ou PID invalide — le test constatera l'absence de relance */
      }
    }
    await firstTurn; // laisse la promesse HTTP se résoudre (erreur réseau attendue)

    // Attend la relance automatique du watchdog (poll jusqu'à 30s).
    const backUp = await waitForUp(30_000);
    const pidAfter = findPidFromHeartbeat();
    const respawned = backUp && pidAfter !== null && pidAfter !== pidBefore;
    const ledgerStatus = backUp ? await readLedgerEntryStatus() : null;
    const ledgerHonest = ledgerStatus === "running"; // jamais résolu par le crash lui-même
    report.crashRecovery = {
      pass: respawned && ledgerHonest,
      detail: `relance auto : ${respawned ? "OUI" : "NON"} (pid ${pidBefore}→${pidAfter}) · ledger après relance : "${ledgerStatus ?? "(absent)"}" (attendu "running", jamais auto-résolu)`,
    };
    log(`  ${report.crashRecovery.pass ? "✅" : "❌"} ${report.crashRecovery.detail}`);

    // ── 3. Intégrité — rien d'autre n'a dû se corrompre pendant le cycle ────────
    if (backUp) {
      const auditRes = await fetch(`${BASE}/api/integrity/audit`, { method: "POST" });
      const auditData = (await auditRes.json()) as { findings?: unknown[] };
      const findings = auditData.findings ?? [];
      report.integrity = { pass: findings.length === 0, findings };
      log(`  ${report.integrity.pass ? "✅" : "❌"} intégrité : ${findings.length} perte(s) inexpliquée(s) détectée(s)`);
    }

    report.overallPass = report.lockRejection.pass && report.crashRecovery.pass && report.integrity.pass;
  } catch (err) {
    log(`erreur : ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    // ── Nettoyage : le projet FIXTURE persiste volontairement (cf. commentaire
    // d'en-tête) — seuls les process/fichiers de CETTE instance isolée sont coupés.
    log("nettoyage (process de l'instance isolée uniquement — le projet fixture reste)…");
    try {
      watchdog.kill();
    } catch {
      /* déjà mort */
    }
    const pidNow = findPidFromHeartbeat();
    if (pidNow) {
      try {
        process.kill(pidNow, "SIGKILL");
      } catch {
        /* déjà mort */
      }
    }
    fs.rmSync(BACKEND_HEARTBEAT_FILE, { force: true });
  }

  fs.mkdirSync(path.dirname(REPORT_FILE), { recursive: true });
  fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));

  console.log(`\n${"═".repeat(72)}`);
  console.log(report.overallPass ? "✅ Sonde de chaos : Parties 0-3 composent correctement." : "❌ Sonde de chaos : au moins un check a échoué.");
  console.log(`Rapport → ${REPORT_FILE}`);
  console.log("═".repeat(72));

  process.exit(report.overallPass ? 0 : 1);
}

main().catch((err) => {
  console.error("[chaos-runner] erreur fatale :", err instanceof Error ? err.stack ?? err.message : err);
  process.exit(1);
});
