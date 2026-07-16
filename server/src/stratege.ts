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
  | { kind: "reframe"; label: string; nudge: string } // (2026-07-14) le MÊME blocage récidive après son
  // remède standard : au lieu d'abandonner (escalade), on demande une remise en question — une approche
  // STRUCTURELLEMENT différente, informée de ce qui a déjà été tenté (accumulation, pas répétition).
  | { kind: "escalate"; reason: string }; // rien à tenter ici → on laisse l'escalade normale

/** État BORNÉ du Stratège pour une tâche : budget de déblocage + remèdes déjà tentés. */
export interface StrategeState {
  budget: number;
  tried: Set<string>;
  /** (2026-07-14) Clés déjà REFRAMÉES — au plus 1 remise en question par blocage,
   *  jamais 2 (bornage strict, en plus du budget global). */
  reframed: Set<string>;
  /** (2026-07-14) Historique COURT et lisible des remèdes déjà tentés sur CE run
   *  (le plus récent en dernier) — injecté dans le nudge de reframe pour que le
   *  modèle apprenne de ses propres tentatives au lieu de les répéter à l'identique. */
  history: string[];
}

export function newStrategeState(budget = Number(process.env.ELEVE_STRATEGE_BUDGET ?? 3)): StrategeState {
  return { budget: Math.max(0, Math.round(Number.isFinite(budget) ? budget : 3)), tried: new Set(), reframed: new Set(), history: [] };
}

/** Classes « stratégiques » où une approche VRAIMENT différente a du sens (contrairement
 *  à missing-dependency/knowledge-gap : mécaniques, retenter la même chose ne change rien). */
const REFRAME_ELIGIBLE = new Set<Diagnosis["blocker"]>(["plateau-iterations", "wandering", "repetitive-failure"]);

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

/** (2026-07-14) Import/export LOCAL incohérent (2 fichiers écrits par l'Élève lui-même
 *  ne s'accordent pas) — remède ULTRA-PRÉCIS au lieu du nudge générique "ambiguous" :
 *  nomme exactement le fichier + le symbole en cause (déjà extraits par `diagnose()`),
 *  pas de devinette à faire pour le modèle. */
export function localImportNudge(d: Diagnosis): string {
  return (
    `⚠ STRATÈGE — ${d.cause}. Ouvre le(s) fichier(s) concerné(s), ajoute l'export manquant ` +
    `(ou corrige l'import s'il visait autre chose), vérifie le build, puis appelle \`finish\`.`
  );
}

/** (2026-07-14) Remise en question — le blocage RÉCIDIVE malgré le remède standard déjà
 *  appliqué. On ne redemande PAS la même chose : on nomme explicitement l'historique des
 *  tentatives (accumulation de connaissance dans le run) et on exige un ANGLE différent,
 *  pas une simple répétition mieux formulée. `chercher_web` est proposé comme source d'un
 *  pattern/exemple RÉEL — comme un humain déterminé qui va chercher comment d'autres ont
 *  résolu un problème similaire plutôt que de retenter la même chose en boucle. */
export function reframeNudge(d: Diagnosis, opts: { planReminder?: string; history?: string[] } = {}): string {
  const hist = (opts.history ?? []).slice(-4); // les 4 dernières tentatives suffisent au contexte
  const histBlock = hist.length
    ? `\nCe que tu as DÉJÀ tenté sur ce projet (n'y retourne PAS) :\n${hist.map((h) => `  • ${h}`).join("\n")}`
    : "";
  const pr = opts.planReminder?.trim();
  return (
    `⚠ STRATÈGE — REMISE EN QUESTION : le blocage « ${d.blocker} » revient malgré ta correction précédente. ` +
    `Ton approche actuelle ne fonctionne pas — ce n'est pas un détail à ajuster, c'est l'ANGLE qui est à changer.` +
    histBlock +
    `\nChoisis une voie STRUCTURELLEMENT différente : (a) si un pattern/exemple existant t'aiderait, appelle ` +
    `\`chercher_web\` pour trouver comment un cas similaire a été résolu ailleurs, avant de recoder ; ` +
    `(b) sinon repense la structure elle-même (autre découpage de composants, autre gestion d'état) plutôt que ` +
    `de redécouper ta même solution. ${pr ? `Le plan : ${pr}. ` : ""}Une fois l'angle changé, vérifie et appelle \`finish\`.`
  );
}

/**
 * Choisit le remède pour un diagnostic. PUR (ne mute pas l'état). Le caller appelle
 * `commitRemedy` quand il APPLIQUE le remède (décrémente le budget + marque tenté).
 * Escalade si : pas de blocage, budget épuisé, remède déjà tenté, ou classe non routée.
 */
export function route(d: Diagnosis, state: StrategeState, opts: { planReminder?: string } = {}): Remedy {
  if (d.blocker === "none") return { kind: "escalate", reason: "pas de blocage" };
  if (state.budget <= 0) return { kind: "escalate", reason: "budget de déblocage épuisé" };

  const key = remedyKey(d);
  if (state.tried.has(key)) {
    // (2026-07-14) RÉCIDIVE — le remède standard a déjà été tenté pour ce blocage exact
    // et n'a pas suffi. Avant d'abandonner (escalade), une SEULE remise en question est
    // permise (bornée par `reframed`, en plus du budget) — réservée aux classes où changer
    // d'angle a du sens (REFRAME_ELIGIBLE) ; les classes mécaniques (install-dependency,
    // knowledge-gap) n'en bénéficient pas — refaire le même acte ne changerait rien.
    if (REFRAME_ELIGIBLE.has(d.blocker) && !state.reframed.has(key)) {
      return { kind: "reframe", label: `remise en question (${d.blocker})`, nudge: reframeNudge(d, { planReminder: opts.planReminder, history: state.history }) };
    }
    return { kind: "escalate", reason: `remède déjà tenté (${d.blocker})` };
  }

  switch (d.blocker) {
    case "missing-dependency":
      if (!d.detail) return { kind: "escalate", reason: "module manquant non identifié" };
      return { kind: "install-dependency", pkg: d.detail, nudge: installedNudge(d.detail) };
    case "local-import-mismatch":
      return { kind: "nudge", label: "corrige l'import/export local", nudge: localImportNudge(d) };
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

/** Marque le remède tenté + décrémente le budget. À appeler à l'APPLICATION du remède.
 *  (2026-07-14) `r` optionnel : si fourni, alimente `history` (accumulation de contexte
 *  pour un futur reframe) et — pour un remède `reframe` — marque la clé comme reframée
 *  (jamais 2 remises en question pour le même blocage, même si le budget le permettrait). */
export function commitRemedy(d: Diagnosis, state: StrategeState, r?: Remedy): void {
  const key = remedyKey(d);
  state.tried.add(key);
  state.budget = Math.max(0, state.budget - 1);
  if (r && r.kind !== "escalate") {
    state.history.push(`${d.blocker} → ${r.kind === "install-dependency" ? `installe ${r.pkg}` : r.label}`);
    if (r.kind === "reframe") state.reframed.add(key);
  }
}

/** Ligne lisible « Mango AGIT » (observabilité du remède choisi). */
export function formatRemedy(d: Diagnosis, r: Remedy): string {
  if (r.kind === "install-dependency") return `🧠 Stratège AGIT : installe « ${r.pkg} » (remède ${d.blocker})`;
  if (r.kind === "reframe") return `🧠 Stratège REMET EN QUESTION : ${r.label}`;
  if (r.kind === "nudge") return `🧠 Stratège AGIT : ${r.label} (remède ${d.blocker})`;
  return `🧠 Stratège : escalade — ${r.reason}`;
}
