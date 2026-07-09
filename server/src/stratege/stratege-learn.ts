// #164 « Le Stratège » Phase 2 — APPRENTISSAGE (la condition C : le compounding).
//
// Un remède qui DÉBLOQUE réellement est distillé en PROCÉDURE #75 ; au prochain blocage
// du MÊME type, Mango la RAPPELLE ("déjà vu ?") et la ressort → il se débloque plus vite,
// projet après projet. Une seule procédure par classe de blocage (slug stable → idempotent,
// pas de prolifération). Deps d'embedding injectables (tests déterministes sans Ollama).
//
// Gaté `ELEVE_STRATEGE_LEARN` (défaut off) côté eleve.ts : Phase 1 reste inchangée tant
// que l'apprentissage n'est pas activé.

import {
  saveProcedure,
  loadProcedure,
  relevantProcedures,
  type ProcedureMeta,
  type ProcedureDeps,
} from "../procedures.js";
import { safeEmbed } from "../notes-rag.js";
import type { Diagnosis } from "./stratege-signals.js";

const STRATEGE_TAG = "stratege";
const defaultDeps: ProcedureDeps = { embed: safeEmbed };

/** Situation-texte STABLE d'un blocage — sert au matching de procédure (≠ la tâche). */
export function strategeProblem(d: Diagnosis): string {
  return `Blocage « ${d.blocker} » — ${d.cause}`;
}

/** Une procédure par CLASSE de blocage (idempotent : un 2ᵉ déblocage met à jour, ne duplique pas). */
export function strategeSlug(d: Diagnosis): string {
  return `debloquer-${d.blocker}`;
}

/** Corps PROCEDURE.md distillé (la démarche éprouvée). */
export function formatProcedureBody(d: Diagnosis, remedyLabel: string): string {
  return [
    `# Débloquer : ${d.blocker}`,
    "",
    `**Situation** : ${d.cause}`,
    `**Signal qui tranche** : ${d.evidence}`,
    `**Remède qui a DÉBLOQUÉ** : ${remedyLabel}`,
    "",
    "> Procédure distillée par Le Stratège (#164) après un déblocage RÉUSSI. Adapte-la, ne copie pas aveuglément.",
    "",
  ].join("\n");
}

/**
 * Rappelle une procédure Stratège pertinente pour CE blocage ("déjà débloqué ça ?").
 * Filtre aux procédures Stratège de la MÊME classe (évite le bruit des procédures #75
 * générales). null si aucune. Ne lève jamais.
 */
export async function recallProcedure(
  workspaceDir: string,
  d: Diagnosis,
  deps: ProcedureDeps = defaultDeps,
): Promise<ProcedureMeta | null> {
  try {
    const top = await relevantProcedures(workspaceDir, strategeProblem(d), 5, deps);
    return top.find((m) => m.tags.includes(STRATEGE_TAG) && m.tags.includes(d.blocker)) ?? null;
  } catch {
    return null;
  }
}

/** Nudge court à préfixer quand une procédure est rappelée (divulgation progressive). */
export function learnedHint(meta: ProcedureMeta): string {
  return (
    `📚 STRATÈGE (déjà vu) — « ${meta.name} » a déjà marché. ` +
    `Lis workspace/.procedures/${meta.slug}/PROCEDURE.md et applique cette démarche.`
  );
}

/**
 * Distille (ou met à jour) une procédure Stratège après un déblocage RÉUSSI. Idempotent
 * par classe (slug stable) : un 2ᵉ déblocage enrichit `usedIn`, ne crée pas de doublon.
 * `nowIso` injectable (le module backend peut utiliser Date ; tests le passent). Ne lève jamais.
 */
export async function distillProcedure(
  workspaceDir: string,
  d: Diagnosis,
  remedyLabel: string,
  project: string,
  nowIso: string,
  deps: ProcedureDeps = defaultDeps,
): Promise<{ saved: boolean; slug: string }> {
  const slug = strategeSlug(d);
  try {
    const existing = loadProcedure(workspaceDir, slug);
    const usedIn = existing ? Array.from(new Set([...existing.meta.usedIn, project])) : [project];
    const problem = strategeProblem(d);
    let embedding = existing?.meta.embedding;
    if (!embedding) {
      try {
        embedding = (await deps.embed(problem)) ?? undefined;
      } catch {
        embedding = undefined;
      }
    }
    saveProcedure(workspaceDir, {
      meta: {
        slug,
        name: `Débloquer : ${d.blocker}`,
        problem,
        tags: [STRATEGE_TAG, d.blocker],
        usedIn,
        embedding,
        createdAt: existing?.meta.createdAt ?? nowIso,
        updatedAt: nowIso,
      },
      body: formatProcedureBody(d, remedyLabel),
    });
    return { saved: true, slug };
  } catch {
    return { saved: false, slug };
  }
}
