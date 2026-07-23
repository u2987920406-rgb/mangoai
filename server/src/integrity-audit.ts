// Vérificateur d'intégrité de l'écosystème MangoOS (#196 fault-finding, Partie 1,
// 2026-07-23). Objectif : détecter automatiquement toute perte SILENCIEUSE d'entrée
// dans un registre d'état global — le mécanisme qui a rendu la disparition de 10
// agents spécialistes forgés (data/specialist-agents.json, incident du 2026-07-23)
// impossible à confirmer avec certitude ; l'investigation n'a pu que CONCLURE
// (suppression manuelle probable), jamais prouver.
//
// Deux étages, VOLONTAIREMENT séparés :
//  1. `integrity-log.ts` — journalise une perte de VALIDATION au moment précis où
//     elle se produit (dans `saveSpecialists`/`saveGaps`/`saveConceptGaps` eux-mêmes).
//  2. CE module — un filet de sécurité PLUS LARGE : compare un snapshot des ids de
//     CHAQUE store connu de l'écosystème à l'instantané précédent, à intervalle
//     régulier, et journalise toute disparition — y compris celles qu'aucun point de
//     sauvegarde connu n'explique (ex. un fichier modifié par autre chose que le code
//     MangoOS lui-même, un bug futur non prévu ici). Distingue la décroissance VOULUE
//     (plafonds/TTL déjà documentés dans le code des stores concernés) de la perte
//     potentiellement suspecte, sans jamais bloquer ni throw.
import { loadSpecialists } from "./specialist/specialist-agents.js";
import { loadGaps } from "./self/self-evolution.js";
import { loadConceptGaps } from "./concept-registry.js";
import { loadRuns as loadTasteRuns } from "./taste/taste-queue.js";
import { loadTasks as loadCronTasks } from "./cron-scheduler.js";
import { loadAgentRegistry } from "./agent/agent-factory.js";
import { loadExternalProjects } from "./external-projects.js";
import { loadGrants } from "./perimeter.js";
import { loadLedger as loadCurationLedger } from "./kernel/kernel-curation-effect.js";
import { loadEntries as loadNocturnalEntries } from "./nocturnal.js";
import { loadRuns as loadEvolutionRuns } from "./prompt-evolution.js";
import { loadStrategistState } from "./stratege/stratege-store.js";
import { atomicWriteFileSync, dataDir } from "./safe-io.js";
import { logDrop } from "./integrity-log.js";
import fs from "node:fs";

export const SNAPSHOT_FILE_NAME = "integrity-snapshot.json";

export interface IntegrityTarget {
  name: string;
  /** Charge les ids ACTUELS du store. N'a JAMAIS besoin de son propre try/catch —
   *  chaque loader de ce projet est déjà fail-open par construction ; ce module
   *  ajoute quand même un filet en cas d'oubli futur. */
  loadIds: () => string[];
  /** Décrit une décroissance VOULUE et déjà documentée dans le code du store
   *  (plafond, TTL, pruneOld…) — n'empêche PAS la détection, sert juste de contexte
   *  pour ne pas s'affoler à la lecture du journal. `undefined` = toute perte ici
   *  est a priori suspecte (pas de mécanisme de purge connu). */
  knownShrinkage?: string;
}

const idsOf = <T,>(list: T[], idOf: (x: T) => string | undefined | null): string[] =>
  list.map(idOf).filter((x): x is string => typeof x === "string" && x.length > 0);

/** Le registre complet — TOUS les stores d'état globaux à ids stables trouvés dans
 *  l'écosystème (audit du 2026-07-23). Exclus délibérément : les caches purs
 *  auto-régénérables (radar.json), les fichiers de CONFIG scalaires (pas de liste
 *  d'entrées), les fixtures statiques (taste-anchors), et les SQLite déjà
 *  versionnées/sauvegardées (blackboard, pdf-store, savoir) — hors du périmètre
 *  "perte silencieuse dans un JSON re-sérialisé en bloc" que ce module couvre. */
export const INTEGRITY_TARGETS: IntegrityTarget[] = [
  {
    name: "specialist-agents",
    loadIds: () => idsOf(loadSpecialists(), (a) => a.id),
    // pas de plafond connu — toute perte ici est a priori suspecte (incident d'origine).
  },
  {
    name: "open-gaps",
    loadIds: () => idsOf(loadGaps(), (g) => g.id),
    knownShrinkage: "évincé au-delà de MAX_GAPS=200 (evictOverflow, closes/plus-anciennes en premier)",
  },
  {
    name: "concept-gaps",
    loadIds: () => idsOf(loadConceptGaps(), (g) => g.id),
    // aucun plafond visible dans concept-registry.ts — croissance non bornée à surveiller aussi.
  },
  {
    name: "taste-queue",
    loadIds: () => idsOf(loadTasteRuns(), (r) => r.id),
    knownShrinkage: "pruneOld() retire les runs décidés/expirés plus vieux que N jours",
  },
  {
    name: "cron-tasks",
    loadIds: () => idsOf(loadCronTasks(), (t) => t.id),
    // tâches définies par l'utilisateur — aucune éviction automatique connue.
  },
  {
    name: "agents-registry",
    loadIds: () => idsOf(loadAgentRegistry(), (a) => a.id),
    // Mango Agent Factory — venait d'être réparée (#0.2) au moment d'écrire ce module.
  },
  {
    name: "external-projects",
    loadIds: () => idsOf(loadExternalProjects(), (p) => p.id),
  },
  {
    name: "perimeter-grants",
    loadIds: () => idsOf(loadGrants(), (g) => g.path), // pas de champ `id` — le chemin EST l'identité
  },
  {
    name: "curation-ledger",
    loadIds: () => idsOf(loadCurationLedger(), (s) => s.ts), // pas de champ `id` — un sample = un timestamp
    knownShrinkage: "MAX_SAMPLES=400 (fenêtre glissante, kernel-curation-effect.ts)",
  },
  {
    name: "nocturnal-entries",
    loadIds: () => idsOf(loadNocturnalEntries(), (e) => e.id),
  },
  {
    name: "prompt-evolution-runs",
    loadIds: () => idsOf(loadEvolutionRuns(), (r) => r.id),
    knownShrinkage: "runs.slice(0, 20) — les 20 plus récents seulement",
  },
  {
    name: "strategist-briefing-items",
    loadIds: () => idsOf(loadStrategistState().items, (i) => i.id),
    knownShrinkage: "pruneStrategistState — cap + TTL par ancienneté (dormant tant que STRATEGE_GLOBAL=off)",
  },
];

interface Snapshot {
  takenAt: string;
  stores: Record<string, string[]>;
}

function snapshotPath(): string {
  return process.env.INTEGRITY_SNAPSHOT_FILE ?? dataDir(SNAPSHOT_FILE_NAME);
}

function readSnapshot(): Snapshot | null {
  try {
    const data: unknown = JSON.parse(fs.readFileSync(snapshotPath(), "utf8"));
    if (data && typeof data === "object" && (data as Snapshot).stores) return data as Snapshot;
    return null;
  } catch {
    return null;
  }
}

function writeSnapshot(s: Snapshot): void {
  try {
    atomicWriteFileSync(snapshotPath(), JSON.stringify(s, null, 2));
  } catch {
    /* best-effort */
  }
}

export interface AuditFinding {
  store: string;
  vanishedIds: string[];
  knownShrinkage?: string;
}

/** Compare l'état ACTUEL de chaque store enregistré au dernier snapshot connu,
 *  journalise toute disparition (integrity-log.ts), PUIS enregistre un nouveau
 *  snapshot pour la prochaine comparaison. Premier appel jamais (pas de snapshot
 *  précédent) → aucune trouvaille, juste l'amorçage. Ne lève jamais — un target dont
 *  `loadIds` lève est traité comme `[]` (fail-open), jamais un crash du process appelant. */
export function auditOnce(targets: IntegrityTarget[] = INTEGRITY_TARGETS): AuditFinding[] {
  const prev = readSnapshot();
  const findings: AuditFinding[] = [];
  const current: Record<string, string[]> = {};
  for (const t of targets) {
    let ids: string[];
    try {
      ids = t.loadIds();
    } catch {
      ids = [];
    }
    current[t.name] = ids;
    if (prev) {
      const prevIds = new Set(prev.stores[t.name] ?? []);
      const curIds = new Set(ids);
      const vanished = [...prevIds].filter((id) => !curIds.has(id));
      if (vanished.length > 0) {
        findings.push({ store: t.name, vanishedIds: vanished, knownShrinkage: t.knownShrinkage });
        logDrop({
          kind: "vanished-between-snapshots",
          store: t.name,
          ids: vanished,
          reason: t.knownShrinkage ? `décroissance possiblement voulue (${t.knownShrinkage}) — à confirmer` : undefined,
        });
      }
    }
  }
  writeSnapshot({ takenAt: new Date().toISOString(), stores: current });
  return findings;
}
