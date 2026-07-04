// Dry-run / mode SIMULATION (#182 D6/É6) — GÉNÉRALISATION du worktree jetable #167/#171,
// PAS un nouveau bac à sable.
//
// Principe (D6) : le dry-run est EXACTEMENT l'exécuteur spéculatif en worktree
// (`eleve-speculative-exec.ts`, #171) avec deux réglages : `root = worktree jetable`
// (déjà le cas) et `apply = DIFFÉRÉ`. On exécute le plan mutant contre un git worktree
// créé par `createSelfWorktree` (#167), on VÉRIFIE chaque étape mutante par le vrai
// type-check/build (`runTscInWorktree` / `inspectProject`), on produit un DIFF + un
// verdict, et on N'APPLIQUE JAMAIS automatiquement. L'application n'a lieu que sur appel
// EXPLICITE de `apply()` — qui fusionne vers le projet réel via `mergeSelfFiles` (#167).
// Si une étape diverge/casse dans le worktree, elle est jetée (reset --hard) ; si la
// simulation entière n'est pas applicable, le worktree est SUPPRIMÉ (`removeSelfWorktree`)
// et RIEN ne touche le projet réel.
//
// ── Articulation avec les garde-fous EXISTANTS (on ne les DOUBLE pas) ──────────────
//   • Confinement de chemin (`resolveInside`) : les écritures des outils restent
//     confinées — ici à la racine du WORKTREE, pas du projet vivant. C'est déjà le cas
//     via `buildSelfRegistry`/`buildEleveActionTools` que `invoke` utilise ; le dry-run
//     ne fait que déplacer la racine confinée vers le worktree jetable.
//   • Gardien de clôture #161 (`eleve-gate.ts`) : injectable via `deps.gate` — il est
//     joué SUR LE RÉSULTAT SIMULÉ (le build du worktree) AVANT que `apply()` ne soit
//     permis. Un verdict Gardien rouge rend `EffetPrevu.ok=false` → `apply()` refuse.
//   • Disjoncteur / budget : bornent la simulation comme une exécution (portés par les
//     deps `invoke`/`typecheck` réutilisées, inchangés).
//
// ── LIMITE V1, HONNÊTE — actions à conséquence EXTERNE NON simulables ──────────────
// L'interface `SimulatableAction` est déclarée GÉNÉRIQUE, mais SEULE l'implémentation
// FICHIER/CODE (`FileCodeAction`) existe en V1. Les actions à conséquence EXTERNE
// (réseau, ORDRE DE MARCHÉ / trading, appel POST irréversible) ne sont PAS simulables
// par ce mécanisme : un worktree jetable ne rejoue pas un effet réseau réel sans le
// produire. C'est un POINT D'EXTENSION DÉCLARÉ, NON RÉSOLU (cf. limites.md §4.5 du plan
// #182) — aucun mock trading n'est codé ici. Ne pas présumer que `SimulatableAction`
// couvre autre chose que le fichier/code tant qu'un adaptateur par domaine n'existe pas.
//
// Deps git/fs INJECTÉES (comme #171) → tests déterministes, zéro vraie opération git.
// Gate `DRY_RUN`, défaut OFF : tant que rien n'importe ce module, l'exécuteur direct
// existant reste byte-identique (OFF = ce fichier n'est jamais dans le chemin).

import { speculativeAttempt } from "./eleve-speculative-runner.js";
import type { DraftStep } from "./eleve-speculative-runner.js";
import type { SpecStep } from "./eleve-speculative.js";
import { realSpecExecDeps, type SpecExecDeps } from "./eleve-speculative-exec.js";
import type { SelfWorktree } from "./mango-self.js";

/** Outils dont le nom dénote une MUTATION → type-check avant d'accepter (même règle que #171). */
const MUTATING = /write|edit|create|modif|patch|append|supprim|delete/i;

/**
 * L'EFFET PRÉVU d'une action simulée : au minimum un DIFF/résumé des changements + le
 * résultat du type-check/build dans le worktree. `ok` = la simulation est-elle APPLICABLE
 * (aucune divergence, build vert, et Gardien vert s'il a été joué) ? `apply()` refuse si `!ok`.
 */
export interface EffetPrevu {
  /** La simulation a-t-elle abouti à un état APPLICABLE (rien ne bloque `apply()`) ? */
  ok: boolean;
  /** Explication courte du verdict. */
  reason: string;
  /** Le DIFF git lisible du préfixe accepté (patch complet). */
  diff: string;
  /** Résumé `--stat` du diff. */
  stat: string;
  /** Fichiers du préfixe accepté (relatifs à la racine), candidats à la fusion. */
  changedFiles: string[];
  /** Étapes acceptées / draftées / index de divergence (comme #171). */
  accepted: number;
  drafted: number;
  divergedAt: number | null;
  /** Le type-check/build du worktree est-il vert sur l'état final accepté ? */
  typecheckOk: boolean;
  /** Verdict du Gardien joué sur le worktree simulé (undefined si non joué). */
  gateOk?: boolean;
  gateRaisons?: string[];
  /** Résumé lisible de la spéculation. */
  summary: string;
}

/**
 * Contrat GÉNÉRIQUE d'une action simulable : `simulate()` produit l'effet prévu SANS
 * toucher le monde réel ; `apply()` — et LUI SEUL — applique réellement. En V1, la seule
 * implémentation est `FileCodeAction` (fichier/code sur worktree). Voir la LIMITE en tête.
 */
export interface SimulatableAction {
  simulate(): Promise<EffetPrevu>;
  apply(): Promise<void>;
}

/**
 * Deps du dry-run fichier/code = celles de l'exécuteur spéculatif (#171) + un hook Gardien
 * OPTIONNEL joué sur le worktree simulé. Injectables → tests sans git/fs réels.
 */
export interface DryRunDeps extends SpecExecDeps {
  /**
   * Joue le Gardien (#161) sur le worktree simulé (build) et rend un verdict. Optionnel :
   * absent → on ne joue pas le Gardien (seuls type-check + non-divergence gouvernent `ok`).
   */
  gate?: (worktree: string, changedFiles: string[]) => Promise<{ ok: boolean; raisons: string[] }>;
}

/**
 * Action FICHIER/CODE simulable : exécute un plan mutant (`DraftStep[]`) contre un worktree
 * jetable, vérifie chaque étape mutante par le type-check, produit un DIFF + verdict, et
 * n'applique JAMAIS avant l'appel explicite `apply()`. Réutilise INTÉGRALEMENT le mécanisme
 * #167/#171 via les deps — ce n'est pas un mécanisme de plus, c'est le même avec apply différé.
 */
export class FileCodeAction implements SimulatableAction {
  private wt: SelfWorktree | null = null;
  private effet: EffetPrevu | null = null;
  private changed: string[] = [];

  constructor(
    private readonly repoRoot: string,
    private readonly slug: string,
    private readonly draft: DraftStep[],
    private readonly deps: DryRunDeps,
  ) {}

  /**
   * Simule : crée le worktree, exécute le plan étape par étape en jetant l'étape divergente,
   * calcule le DIFF du préfixe accepté, joue le Gardien s'il est fourni, et renvoie l'effet
   * prévu. NE FUSIONNE RIEN. Idempotent (une 2ᵉ simulation renvoie le même effet mémoïsé).
   * Si la simulation n'est PAS applicable, le worktree est immédiatement JETÉ (rien ne reste).
   */
  async simulate(): Promise<EffetPrevu> {
    if (this.effet) return this.effet;
    const base: EffetPrevu = {
      ok: false, reason: "", diff: "", stat: "", changedFiles: [],
      accepted: 0, drafted: this.draft.length, divergedAt: null, typecheckOk: false, summary: "",
    };
    if (!this.draft.length) return (this.effet = { ...base, reason: "plan vide" });

    const { wt, reason } = await this.deps.createWorktree(this.repoRoot, this.slug);
    if (!wt) return (this.effet = { ...base, reason: `worktree impossible : ${reason}` });
    this.wt = wt;

    let lastTypecheck = true;
    try {
      // Point de départ (branche off HEAD) : sert à calculer le diff du préfixe accepté.
      const baseRev = (await this.deps.git(["rev-parse", "HEAD"], wt.worktree)).stdout.trim();

      const attempt = await speculativeAttempt(this.draft, {
        execute: (s: SpecStep<DraftStep>) => this.deps.invoke(wt.worktree, s.payload!.tool, s.payload!.args),
        verify: async (s: SpecStep<DraftStep>, outcome) => {
          if (!outcome.ok) return false;
          const step = s.payload!;
          if (MUTATING.test(step.tool)) {
            const green = await this.deps.typecheck(wt.worktree);
            lastTypecheck = green;
            if (!green) return false; // build cassé → divergence (l'étape sera jetée)
          }
          // checkpoint : on fige l'étape acceptée dans le worktree (jetable)
          await this.deps.git(["add", "-A"], wt.worktree);
          await this.deps.git(["commit", "-m", `dry: ${step.label}`.slice(0, 72), "--no-verify"], wt.worktree);
          return true;
        },
      });

      // L'étape divergente a pu muter le worktree sans commit → on la jette proprement.
      if (attempt.escalate) {
        await this.deps.git(["reset", "--hard"], wt.worktree);
        await this.deps.git(["clean", "-fd"], wt.worktree);
      }

      // DIFF du préfixe accepté = diff des checkpoints depuis le point de départ.
      let changed: string[] = [];
      let diff = "";
      let stat = "";
      if (attempt.result.accepted > 0 && baseRev) {
        const names = await this.deps.git(["diff", "--name-only", `${baseRev}..HEAD`], wt.worktree);
        if (names.code === 0) changed = names.stdout.split("\n").map((s) => s.trim()).filter(Boolean);
        const patch = await this.deps.git(["diff", `${baseRev}..HEAD`], wt.worktree);
        diff = patch.stdout;
        const st = await this.deps.git(["diff", "--stat", `${baseRev}..HEAD`], wt.worktree);
        stat = st.stdout;
      }
      this.changed = changed;

      const typecheckOk = !attempt.escalate && lastTypecheck;

      // Gardien #161 joué SUR LE RÉSULTAT SIMULÉ (build du worktree), avant d'autoriser apply().
      let gateOk: boolean | undefined;
      let gateRaisons: string[] | undefined;
      if (this.deps.gate && typecheckOk && changed.length > 0) {
        try {
          const g = await this.deps.gate(wt.worktree, changed);
          gateOk = g.ok;
          gateRaisons = g.raisons;
        } catch (e) {
          gateOk = false;
          gateRaisons = [`Gardien indisponible : ${(e as Error).message.split("\n")[0]}`];
        }
      }

      const ok = !attempt.escalate && typecheckOk && (gateOk ?? true);
      this.effet = {
        ok,
        reason: attempt.escalate
          ? `divergence à l'étape #${attempt.result.divergedAt} → non applicable`
          : ok
            ? "simulation applicable (rien n'est écrit sans apply())"
            : gateOk === false
              ? "Gardien rouge sur le résultat simulé → non applicable"
              : "type-check rouge dans le worktree → non applicable",
        diff, stat, changedFiles: changed,
        accepted: attempt.result.accepted, drafted: attempt.result.drafted, divergedAt: attempt.result.divergedAt,
        typecheckOk, gateOk, gateRaisons, summary: attempt.summary,
      };
    } catch (e) {
      this.effet = { ...base, reason: `simulation : ${(e as Error).message}` };
    }

    // Non applicable → on JETTE le worktree tout de suite ; le projet réel reste intact.
    if (!this.effet.ok) await this.dispose();
    return this.effet;
  }

  /**
   * APPLIQUE réellement : fusionne le préfixe accepté vers le projet vivant (`mergeSelfFiles`
   * via `deps.apply`), PUIS libère le worktree. Refuse si la simulation n'a pas eu lieu, n'est
   * pas applicable (`ok=false`), ou si le worktree a déjà été libéré. SEUL point qui touche le réel.
   */
  async apply(): Promise<void> {
    if (!this.effet) throw new Error("apply() sans simulate() préalable — simule d'abord.");
    if (!this.effet.ok) throw new Error(`apply() refusé — simulation non applicable : ${this.effet.reason}`);
    if (!this.wt) throw new Error("apply() : worktree déjà libéré (double apply/dispose).");
    try {
      if (this.changed.length > 0) this.deps.apply(this.repoRoot, this.wt.worktree, this.changed);
    } finally {
      await this.dispose();
    }
  }

  /** Jette le worktree jetable sans rien appliquer (idempotent). Ne lève jamais. */
  async dispose(): Promise<void> {
    const wt = this.wt;
    this.wt = null;
    if (wt) {
      try { await this.deps.removeWorktree(wt); } catch { /* best-effort : worktree jetable */ }
    }
  }
}

/**
 * Deps réelles du dry-run = celles de l'exécuteur spéculatif (#171, worktree/git/merge réels)
 * + un hook Gardien optionnel. `realSpecExecDeps()` fournit createWorktree/removeWorktree/
 * invoke/typecheck/git/apply ; on n'y ajoute que `gate` s'il est fourni par l'appelant.
 */
export function realDryRunDeps(
  gate?: (worktree: string, changedFiles: string[]) => Promise<{ ok: boolean; raisons: string[] }>,
): DryRunDeps {
  return { ...realSpecExecDeps(), gate };
}

/**
 * Fabrique une action fichier/code simulable. Point d'entrée unique : l'appelant fait
 * `const a = fileCodeDryRun(...); const effet = await a.simulate(); if (verdict) await a.apply();`
 */
export function fileCodeDryRun(
  repoRoot: string,
  slug: string,
  draft: DraftStep[],
  deps: DryRunDeps = realDryRunDeps(),
): FileCodeAction {
  return new FileCodeAction(repoRoot, slug, draft, deps);
}
