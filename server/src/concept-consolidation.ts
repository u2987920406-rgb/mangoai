// Boucle de vérification contextuelle — Étape 1 (2026-07-08), le mécanisme
// d'apprentissage dans le temps. Décalque de `taste-nocturnal.ts` (scheduler
// tick + config fichier + batch injectable).
//
// Journalise chaque vérification (concept, signature de contexte, verdict,
// issue finale du Gardien/Raf) puis, la nuit, RENFORCE ou DÉGRADE la confiance
// des concepts validés selon ce qui s'est réellement passé — c'est le mécanisme
// « ça devient moins cher avec le temps » demandé par Raf : un concept dont les
// vérifications convergent avec des issues positives devient plus fiable (le
// chemin rapide gagne en confiance) ; une contradiction (un concept validé
// produit malgré tout une issue négative) dégrade sa confiance — la mémoire
// PEUT désapprendre, parade documentée contre la dérive (cf. plan, point 5).
import fs from "node:fs";
import path from "node:path";
import { atomicWriteFileSync } from "./safe-io.js";
import { updateConceptConfidence, type Embed } from "./concept-registry.js";
import type { VerdictContexte } from "./verificateur-contexte.js";
import type { Blackboard } from "./kernel-blackboard.js";

export interface VerificationEvent {
  concept: string;
  /** Résumé COURT du contexte de tâche au moment de la vérification (pas l'embedding
   *  — juste de quoi comprendre, en relecture, "même mot mais quel contexte"). */
  contexteSignature: string;
  verdict: VerdictContexte;
  cheminUtilise: "rapide" | "lent" | "aucun";
  /** Issue RÉELLE constatée après coup (Gardien #161 ou jugement de Raf) —
   *  `null` = pas encore connue au moment de la journalisation. */
  issuePositive: boolean | null;
  timestamp: string;
}

function telemetryFile(): string {
  return process.env.CONCEPT_TELEMETRY_FILE ?? path.join(import.meta.dirname, "..", "data", "concept-verifications.jsonl");
}

/** Journalise un événement de vérification. Append-only (comme project-backlog.ts
 *  côté #183) — un append est une seule syscall, jamais de réécriture complète
 *  qui risquerait de perdre tout l'historique. Ne lève jamais. */
export function logVerification(event: Omit<VerificationEvent, "timestamp">, now: number = Date.now()): void {
  try {
    const full: VerificationEvent = { ...event, timestamp: new Date(now).toISOString() };
    const f = telemetryFile();
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.appendFileSync(f, JSON.stringify(full) + "\n", "utf8");
  } catch {
    // best-effort — la télémétrie ne doit jamais bloquer une vérification réelle
  }
}

function isVerificationEvent(x: unknown): x is VerificationEvent {
  return !!x && typeof x === "object"
    && typeof (x as { concept?: unknown }).concept === "string"
    && typeof (x as { verdict?: unknown }).verdict === "string";
}

/** Lit la télémétrie. Une ligne corrompue est ignorée (jamais un crash). */
export function loadVerifications(): VerificationEvent[] {
  let raw: string;
  try {
    raw = fs.readFileSync(telemetryFile(), "utf8");
  } catch {
    return [];
  }
  const out: VerificationEvent[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (isVerificationEvent(parsed)) out.push(parsed);
    } catch {
      // ligne corrompue — ignorée
    }
  }
  return out;
}

// ── Consolidation nocturne : renforcement / dégradation de confiance ─────────

export const RENFORCEMENT_MIN_HITS = 3; // N vérifications "correspond" + issue positive consécutives
export const RENFORCEMENT_DELTA = 0.05;
export const DEGRADATION_DELTA = -0.25; // une contradiction pèse plus lourd qu'un renforcement — prudence

export interface ConsolidationResult {
  renforces: string[]; // mots dont la confiance a augmenté
  degrades: string[]; // mots dont la confiance a baissé (contradiction constatée)
  ignores: string[]; // mots avec des issues encore inconnues (null) — rien à en tirer
}

/**
 * Job nocturne : relit la télémétrie, groupe par concept, et ajuste la confiance
 * de chaque concept validé selon ce qui s'est RÉELLEMENT passé (pas juste le
 * verdict du juge — l'issue finale constatée). Ne lève jamais.
 */
export async function consoliderConfiance(
  deps: { bb?: Blackboard; embed?: Embed; events?: VerificationEvent[] } = {},
): Promise<ConsolidationResult> {
  const events = deps.events ?? loadVerifications();
  const parConcept = new Map<string, VerificationEvent[]>();
  for (const e of events) {
    const list = parConcept.get(e.concept) ?? [];
    list.push(e);
    parConcept.set(e.concept, list);
  }

  const result: ConsolidationResult = { renforces: [], degrades: [], ignores: [] };
  for (const [concept, evs] of parConcept) {
    const connues = evs.filter((e) => e.issuePositive !== null);
    if (connues.length === 0) {
      result.ignores.push(concept);
      continue;
    }
    // Une SEULE contradiction (concept jugé "correspond" mais issue négative,
    // OU jugé "ne-correspond-pas" à tort — repéré via une issue positive malgré
    // un rejet) pèse plus que plusieurs succès : on dégrade au premier signal.
    const contradiction = connues.some(
      (e) => (e.verdict === "correspond" && e.issuePositive === false) || (e.verdict === "ne-correspond-pas" && e.issuePositive === true),
    );
    if (contradiction) {
      const updated = await updateConceptConfidence(concept, DEGRADATION_DELTA, { bb: deps.bb, embed: deps.embed });
      if (updated) result.degrades.push(concept);
      continue;
    }
    const succesConsecutifs = connues.filter((e) => e.verdict === "correspond" && e.issuePositive === true).length;
    if (succesConsecutifs >= RENFORCEMENT_MIN_HITS) {
      const updated = await updateConceptConfidence(concept, RENFORCEMENT_DELTA, { bb: deps.bb, embed: deps.embed });
      if (updated) result.renforces.push(concept);
    }
  }
  return result;
}
