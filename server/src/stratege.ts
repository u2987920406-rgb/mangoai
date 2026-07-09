// #164 « Le Stratège » Phase 1 — ROUTEUR DÉTERMINISTE.
//
// À un blocage diagnostiqué (stratege-signals.ts → Diagnosis), le Stratège CHOISIT un
// remède concret au lieu de la séquence FIXE d'eleve.ts (toujours buildRelanceNudge /
// toujours break vers l'escalade). Pur, déterministe, BORNÉ (budget de déblocage + on ne
// re-tente jamais le même remède → pas de boucle). L'EXÉCUTION (install, nudge, relance)
// est câblée dans eleve.ts ; ici on ne fait que DÉCIDER (testable sans réseau).
//
// Phase 1 couvre les classes qu'on touche VRAIMENT (run aléatoire 2026-06-26) :
//   missing-dependency → installer la lib ; knowledge-gap → se documenter (web) ;
//   wandering → ré-ancrer le plan (L17) ; plateau-iterations → décomposer (delegate).
// Les autres classes (wrong-tool, flaky-resource, ambiguous) → escalade (gérées ailleurs
// ou réservées aux phases suivantes).

import type { Diagnosis } from "./stratege/stratege-signals.js";

export type Remedy =
  | { kind: "install-dependency"; pkg: string; nudge: string } // ACTE : npm install <pkg> puis relance
  | { kind: "nudge"; label: string; nudge: string } // relance ciblée (texte injecté à l'Élève)
  | { kind: "escalate"; reason: string }; // rien à tenter ici → on laisse l'escalade normale

/** État BORNÉ du Stratège pour une tâche : budget de déblocage + remèdes déjà tentés. */
export interface StrategeState {
  budget: number;
  tried: Set<string>;
}

export function newStrategeState(budget = Number(process.env.ELEVE_STRATEGE_BUDGET ?? 3)): StrategeState {
  return { budget: Math.max(0, Math.round(Number.isFinite(budget) ? budget : 3)), tried: new Set() };
}

/** Clé d'unicité d'un remède (classe + donnée extraite, ex. le module manquant). */
export function remedyKey(d: Diagnosis): string {
  return `${d.blocker}:${d.detail ?? ""}`;
}

// ── Nudges ciblés (purs) ──────────────────────────────────────────────────────
export function knowledgeNudge(): string {
  return (
    "⚠ STRATÈGE — tu butes sur l'usage d'une lib/API sans t'être documenté. " +
    "AVANT de réécrire le code : appelle `chercher_web` (puis `lire_page`) pour trouver l'usage CORRECT " +
    "(ou `chercher_artefact` si tu l'as déjà fait). Puis corrige et appelle `finish`."
  );
}

export function decomposeNudge(): string {
  return (
    "⚠ STRATÈGE — plafond d'itérations atteint : la tâche est trop large d'un bloc. " +
    "DÉCOUPE-la : confie les parties INDÉPENDANTES à des sous-agents via `delegate`, " +
    "puis intègre et appelle `finish`. N'essaie plus de tout faire en une seule passe."
  );
}

export function repetitiveNudge(): string {
  return (
    "⚠ STRATÈGE — tu réécris en boucle sans résoudre l'erreur de build. STOP le patch au hasard. " +
    "1) LIS le message d'erreur EXACT et identifie la ligne/le symbole en cause. " +
    "2) Si c'est un usage de lib/API : appelle `chercher_web` (puis `lire_page`) avant de recoder. " +
    "3) Sinon DÉLÈGUE la partie qui coince via `delegate`. Puis corrige, vérifie le build et appelle `finish`."
  );
}

export function wanderingNudge(planReminder?: string): string {
  const pr = planReminder?.trim();
  return pr
    ? `⚠ STRATÈGE — tu dérives (sur-exploration). ${pr} Reprends les étapes NON faites, arrête de relire/replanifier, AGIS et appelle \`finish\`.`
    : "⚠ STRATÈGE — tu dérives (sur-exploration). Arrête de relire/replanifier, termine les étapes restantes et appelle `finish`.";
}

export function installedNudge(pkg: string): string {
  return `✅ STRATÈGE — j'ai installé « ${pkg} » pour toi. L'import est maintenant résolu : reprends, vérifie le build et appelle \`finish\`.`;
}

/**
 * Choisit le remède pour un diagnostic. PUR (ne mute pas l'état). Le caller appelle
 * `commitRemedy` quand il APPLIQUE le remède (décrémente le budget + marque tenté).
 * Escalade si : pas de blocage, budget épuisé, remède déjà tenté, ou classe non routée.
 */
export function route(d: Diagnosis, state: StrategeState, opts: { planReminder?: string } = {}): Remedy {
  if (d.blocker === "none") return { kind: "escalate", reason: "pas de blocage" };
  if (state.budget <= 0) return { kind: "escalate", reason: "budget de déblocage épuisé" };
  if (state.tried.has(remedyKey(d))) return { kind: "escalate", reason: `remède déjà tenté (${d.blocker})` };

  switch (d.blocker) {
    case "missing-dependency":
      if (!d.detail) return { kind: "escalate", reason: "module manquant non identifié" };
      return { kind: "install-dependency", pkg: d.detail, nudge: installedNudge(d.detail) };
    case "knowledge-gap":
      return { kind: "nudge", label: "documente-toi (web)", nudge: knowledgeNudge() };
    case "plateau-iterations":
      return { kind: "nudge", label: "décompose (delegate)", nudge: decomposeNudge() };
    case "repetitive-failure":
      return { kind: "nudge", label: "change d'approche", nudge: repetitiveNudge() };
    case "wandering":
      return { kind: "nudge", label: "ré-ancre le plan", nudge: wanderingNudge(opts.planReminder) };
    default:
      return { kind: "escalate", reason: `classe ${d.blocker} non routée en Phase 1` };
  }
}

/** Marque le remède tenté + décrémente le budget. À appeler à l'APPLICATION du remède. */
export function commitRemedy(d: Diagnosis, state: StrategeState): void {
  state.tried.add(remedyKey(d));
  state.budget = Math.max(0, state.budget - 1);
}

/** Ligne lisible « Mango AGIT » (observabilité du remède choisi). */
export function formatRemedy(d: Diagnosis, r: Remedy): string {
  if (r.kind === "install-dependency") return `🧠 Stratège AGIT : installe « ${r.pkg} » (remède ${d.blocker})`;
  if (r.kind === "nudge") return `🧠 Stratège AGIT : ${r.label} (remède ${d.blocker})`;
  return `🧠 Stratège : escalade — ${r.reason}`;
}
