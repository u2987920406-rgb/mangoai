// Câblage du decay mémoire (inspiré de `harnais-2027/src/memory/consolidation.ts` —
// "l'oubli est une fonctionnalité, pas un bug" — réimplémenté sans dépendance).
//
// `BlackboardStore.prune()` (kernel-blackboard-store.ts) existe et est testé
// (test-blackboard-prune.ts) depuis A0.3, mais RIEN ne l'appelait en production —
// vérifié par grep avant d'écrire ce module. Ce fichier est uniquement le CÂBLAGE :
// un tick périodique, gaté par le flag existant `BLACKBOARD_TTL` (flags.ts), qui
// purge les scopes de MÉMOIRE APPRISE (artefacts réutilisables cross-projet) —
// jamais les scopes de VÉRITÉ VALIDÉE PAR RAF (ex. `CONCEPT_SCOPE`, jamais pruné
// automatiquement : sa seule voie d'écriture est un clic humain explicite,
// cf. concept-registry.ts).
import { getBlackboard } from "./kernel-blackboard.js";
import { flag } from "../flags.js";
import { ARTIFACT_SCOPE } from "./kernel-artifacts.js";
import { COMPONENT_SCOPE, LAYOUT_SCOPE, SKILL_SCOPE } from "./kernel-reuse.js";

/** Scopes de mémoire APPRISE éligibles au decay (jamais les scopes validés humains). */
export const DECAYABLE_SCOPES: string[] = [ARTIFACT_SCOPE, COMPONENT_SCOPE, LAYOUT_SCOPE, SKILL_SCOPE];

/** Âge max par défaut avant purge (90 jours) — override `BLACKBOARD_TTL_MS`. */
export const DEFAULT_TTL_MS = 90 * 24 * 60 * 60 * 1000;
/** Volume max par scope par défaut (garde les plus récents) — override `BLACKBOARD_MAX_ENTRIES`. */
export const DEFAULT_MAX_ENTRIES = 500;

export interface DecayResult {
  ranScopes: string[];
  deletedByScope: Record<string, number>;
  totalDeleted: number;
}

/**
 * Un passage de decay : purge chaque scope éligible selon TTL + volume max.
 * No-op (retourne un résultat vide) si le flag `BLACKBOARD_TTL` est OFF — le
 * flag reste la SEULE porte, ce module ne décide jamais de son propre chef.
 */
export function runBlackboardDecay(
  olderThanMs = Number(process.env.BLACKBOARD_TTL_MS ?? DEFAULT_TTL_MS),
  maxEntries = Number(process.env.BLACKBOARD_MAX_ENTRIES ?? DEFAULT_MAX_ENTRIES),
): DecayResult {
  const result: DecayResult = { ranScopes: [], deletedByScope: {}, totalDeleted: 0 };
  if (!flag("BLACKBOARD_TTL")) return result;

  const bb = getBlackboard();
  for (const scope of DECAYABLE_SCOPES) {
    const deleted = bb.prune(scope, { olderThanMs, maxEntries });
    result.ranScopes.push(scope);
    result.deletedByScope[scope] = deleted;
    result.totalDeleted += deleted;
  }
  return result;
}

let intervalHandle: NodeJS.Timeout | undefined;

/** Démarre le tick périodique (défaut 6h) — patron identique à `taste-nocturnal.ts`
 *  (`startTasteNocturnalScheduler`). Toujours appelable au boot : no-op tant que
 *  `BLACKBOARD_TTL` est OFF (défaut), donc zéro effet de bord par défaut. */
export function startBlackboardDecayScheduler(periodMs = 6 * 60 * 60 * 1000): void {
  if (intervalHandle) return; // déjà démarré (idempotent, utile en test)
  intervalHandle = setInterval(() => {
    const r = runBlackboardDecay();
    if (r.totalDeleted > 0) {
      console.log(`[blackboard-decay] ${r.totalDeleted} artefact(s) purgé(s) sur ${r.ranScopes.length} scope(s)`);
    }
  }, periodMs);
}

/** Arrête le tick (tests). */
export function stopBlackboardDecayScheduler(): void {
  if (intervalHandle) { clearInterval(intervalHandle); intervalHandle = undefined; }
}
