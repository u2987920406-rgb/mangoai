// Tests du cœur pur du superviseur backend (watchdog-core.ts, #196 fault-finding
// Partie 3). Déterministe, zéro process réel, zéro disque, zéro timer — même
// patron que test-watchdog-core.ts côté MangoQA (repo séparé, déjà prouvé).
import { line, makeCheck } from "./test-util.js";
import {
  parseHeartbeat,
  heartbeatAgeMs,
  isHeartbeatStale,
  respawnDelayMs,
  DEFAULT_STALE_THRESHOLD_MS,
  FAST_FAILURE_THRESHOLD_MS,
} from "../watchdog-core.js";

let failures = 0;
const check = makeCheck(() => { failures++; });

line("═");
console.log("watchdog-core — superviseur backend (#196 fault-finding Partie 3)");
line();

// parseHeartbeat
{
  const r = parseHeartbeat(JSON.stringify({ heartbeat: "2026-07-23T10:00:00.000Z", pid: 1234 }));
  check("parse une sentinelle valide", r?.heartbeat === "2026-07-23T10:00:00.000Z" && r?.pid === 1234);
}
check("rejette un JSON invalide sans lever", parseHeartbeat("{ pas du json") === null);
check("rejette un objet sans champ heartbeat", parseHeartbeat(JSON.stringify({ pid: 1 })) === null);
check("rejette un objet sans champ pid", parseHeartbeat(JSON.stringify({ heartbeat: "2026-07-23T10:00:00.000Z" })) === null);
check("rejette une date heartbeat invalide", parseHeartbeat(JSON.stringify({ heartbeat: "pas-une-date", pid: 1 })) === null);

// heartbeatAgeMs
{
  const now = Date.parse("2026-07-23T10:01:00.000Z");
  check("sentinelle absente (null) → Infinity, jamais frais par défaut", heartbeatAgeMs(null, now) === Infinity);
  check("sentinelle illisible/corrompue → Infinity", heartbeatAgeMs("pas du json", now) === Infinity);
  const raw = JSON.stringify({ heartbeat: "2026-07-23T10:00:00.000Z", pid: 1 });
  check("calcule l'écart réel en ms", heartbeatAgeMs(raw, now) === 60_000);
  const futureRaw = JSON.stringify({ heartbeat: "2026-07-23T10:02:00.000Z", pid: 1 });
  check("heartbeat futur (horloge décalée) → âge négatif, jamais périmé", heartbeatAgeMs(futureRaw, now) < 0);
}

// isHeartbeatStale
check("frais (< seuil) → pas périmé", isHeartbeatStale(30_000, DEFAULT_STALE_THRESHOLD_MS) === false);
check("exactement au seuil → pas encore périmé (strictement >)", isHeartbeatStale(DEFAULT_STALE_THRESHOLD_MS, DEFAULT_STALE_THRESHOLD_MS) === false);
check("au-delà du seuil → périmé", isHeartbeatStale(DEFAULT_STALE_THRESHOLD_MS + 1, DEFAULT_STALE_THRESHOLD_MS) === true);
check("Infinity (sentinelle absente) → toujours périmé", isHeartbeatStale(Infinity, DEFAULT_STALE_THRESHOLD_MS) === true);
check("seuil custom respecté (frais)", isHeartbeatStale(5_000, 10_000) === false);
check("seuil custom respecté (périmé)", isHeartbeatStale(15_000, 10_000) === true);

// respawnDelayMs — anti-tempête de relances
check("0 échec rapide consécutif → délai de base", respawnDelayMs(0, 3_000, 60_000) === 3_000);
check("grandit avec les échecs rapides consécutifs (1)", respawnDelayMs(1, 3_000, 60_000) === 6_000);
check("grandit avec les échecs rapides consécutifs (2)", respawnDelayMs(2, 3_000, 60_000) === 9_000);
check("borné au maximum (pas de croissance infinie)", respawnDelayMs(100, 3_000, 60_000) === 60_000);

// Cohérence des constantes
check("FAST_FAILURE_THRESHOLD_MS < DEFAULT_STALE_THRESHOLD_MS (sinon un cycle sain se ferait passer pour un échec rapide)", FAST_FAILURE_THRESHOLD_MS < DEFAULT_STALE_THRESHOLD_MS);

line("═");
console.log(failures === 0 ? "✅ watchdog-core : tout est prouvé." : `❌ ${failures} échec(s)`);
process.exit(failures === 0 ? 0 : 1);
