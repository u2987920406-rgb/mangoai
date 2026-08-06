// Refonte v3 — lot 4 : `recall()`, LE POINT DE LECTURE UNIQUE de la mémoire.
//
// Doc 05 § 2.1 : « TOUTE lecture de mémoire du système passe par ici. Sans exception. »
//
// ─────────────────────────────────────────────────────────────────────────────
// CE MODULE NE RÉÉCRIT AUCUN MAGASIN — même règle que `v3/` pour le dispatcher
// ─────────────────────────────────────────────────────────────────────────────
// Les magasins existants restent la source : `loadAxioms`, `loadPreferences`,
// `loadUserProfile`, `loadSelfKnowledge`, `loadMemory`, `loadLexique`,
// `relevantProcedures`. Ils fonctionnent, ils sont testés, et trois d'entre eux
// portent des données réelles (57 procédures, 119 lexiques de projet). Ce fichier
// leur ajoute la seule chose qui manquait : **un arbitrage commun**.
//
// Ce n'est donc pas la migration du doc 05 § 6 — c'est son étape 1, celle qui
// s'adosse à l'existant. Rien n'est déplacé, rien n'est supprimé.
//
// ─────────────────────────────────────────────────────────────────────────────
// POURQUOI UN POINT UNIQUE CHANGE QUELQUE CHOSE
// ─────────────────────────────────────────────────────────────────────────────
// Avant, chaque magasin décidait seul de s'injecter et de se tronquer. `.axioms.md`
// se coupait à 3 000 caractères — en gardant les plus ANCIENS — sans que personne ne
// puisse voir qu'il en écartait 98,9 %. Aucune couche ne pouvait répondre à « qu'est-ce
// qui vaut le coup, sur mon budget ? », parce qu'aucune couche ne voyait l'ensemble.
//
// `recall` voit l'ensemble, arbitre une fois, et **déclare ce qu'il écarte**.

import {
  arbitre,
  BUDGET_DEFAUT,
  resumeArbitrage,
  type Arbitrage,
  type Budget,
  type Etage,
  type Fragment,
} from "./budget.js";

/** Ce que l'appelant sait de son tour — sert à décider quels étages s'allument. */
export interface ScopeRappel {
  /** Racine du workspace : porte l'Identité (axiomes, préférences, profil). */
  readonly workspaceDir: string;
  /** Dossier du projet courant, s'il y en a un : porte l'étage Projet. */
  readonly projectDir?: string;
  /** true → ② Goût s'allume (doc 05 § 2.2 : « sur toute tâche visuelle »). */
  readonly tacheVisuelle?: boolean;
}

/** Les lectures dont `recall` a besoin. Toutes injectables : c'est ce qui permet de
 *  prouver l'arbitrage sans toucher au disque ni aux vrais magasins. */
export interface LecturesMemoire {
  axiomes(workspaceDir: string): string;
  preferences(workspaceDir: string): string;
  profil(workspaceDir: string): string;
  selfKnowledge(workspaceDir: string): string;
  memoireProjet(projectDir: string): string;
  lexique(dir: string): string;
  /** Procédures PERTINENTES pour la tâche — ce magasin sait déjà classer, on ne
   *  refait pas son travail (doc 05 : « on garde, on allume, on nomme »). */
  procedures(workspaceDir: string, query: string): Promise<string>;
}

export interface OptionsRecall {
  readonly budget?: Budget;
  readonly total?: number;
  readonly compte?: (texte: string) => number;
  readonly lectures?: Partial<LecturesMemoire>;
  /** Journal de l'arbitrage. Défaut : `console.warn` uniquement quand un étage
   *  incompressible a été amputé — le reste serait du bruit à chaque tour. */
  readonly journalise?: (ligne: string) => void;
}

export interface Souvenir extends Fragment {}

export interface ResultatRecall {
  readonly souvenirs: readonly Souvenir[];
  readonly arbitrage: Arbitrage;
  /** Le texte prêt à injecter, étages séparés. Vide si rien n'est retenu. */
  readonly texte: string;
}

/** Câblage réel vers les magasins existants, résolu paresseusement : importer les
 *  magasins au chargement du module ferait payer leur graphe à tout appelant. */
async function lecturesReelles(): Promise<LecturesMemoire> {
  const [axioms, prefs, mem, self, lex, proc] = await Promise.all([
    import("../axioms.js"),
    import("../preferences.js"),
    import("../memory.js"),
    import("../self-knowledge.js"),
    import("../lexique.js"),
    import("../procedures.js"),
  ]);
  return {
    axiomes: (w) => axioms.loadAxioms(w),
    preferences: (w) => prefs.loadPreferences(w),
    profil: (w) => mem.loadUserProfile(w),
    selfKnowledge: (w) => self.loadSelfKnowledge(w),
    memoireProjet: (d) => mem.loadMemory(d),
    lexique: (d) => lex.loadLexique(d),
    // `proceduresPromptSection` classe PUIS met en forme — `relevantProcedures`
    // rend des métadonnées. On réutilise le formateur du magasin plutôt que d'en
    // écrire un second qui divergerait au premier changement de format.
    procedures: async (w, q) => {
      try { return (await proc.proceduresPromptSection(w, q)) ?? ""; } catch { return ""; }
    },
  };
}

const vide = (): string => "";
const videAsync = async (): Promise<string> => "";

const LECTURES_NEUTRES: LecturesMemoire = {
  axiomes: vide, preferences: vide, profil: vide, selfKnowledge: vide,
  memoireProjet: vide, lexique: vide, procedures: videAsync,
};

/** Ajoute un fragment s'il porte quelque chose. Un fragment vide n'est pas un
 *  souvenir : il consommerait une ligne de journal pour dire qu'il n'a rien dit. */
function pousse(dans: Fragment[], etage: Etage, source: string, texte: string): void {
  const t = (texte ?? "").trim();
  if (t) dans.push({ etage, source, texte: t });
}

/**
 * Rappelle ce qui vaut le coup, dans un budget explicite.
 *
 * Ne throw JAMAIS : un magasin illisible rend un fragment vide, pas une exception.
 * La mémoire est un CONFORT de contexte — elle ne doit jamais faire échouer un tour
 * qui aurait abouti sans elle. C'est la même garantie que `dispatch` côté cerveau.
 */
export async function recall(
  scope: ScopeRappel,
  query: string,
  opts: OptionsRecall = {},
): Promise<ResultatRecall> {
  const base = opts.lectures
    ? { ...LECTURES_NEUTRES, ...opts.lectures }
    : await lecturesReelles().catch(() => LECTURES_NEUTRES);

  const sur = <T>(f: () => T, repli: T): T => { try { return f(); } catch { return repli; } };
  const fragments: Fragment[] = [];

  // ── ① IDENTITÉ — qui est l'utilisateur, ses règles non négociables ──────────
  pousse(fragments, "identite", ".axioms.md", sur(() => base.axiomes(scope.workspaceDir), ""));
  pousse(fragments, "identite", ".preferences.md", sur(() => base.preferences(scope.workspaceDir), ""));
  pousse(fragments, "identite", "profil utilisateur", sur(() => base.profil(scope.workspaceDir), ""));
  pousse(fragments, "identite", "self-knowledge", sur(() => base.selfKnowledge(scope.workspaceDir), ""));

  // ── ③ PROJET — l'état du projet courant ────────────────────────────────────
  if (scope.projectDir) {
    pousse(fragments, "projet", ".memory.md", sur(() => base.memoireProjet(scope.projectDir!), ""));
  }

  // ── ④ SAVOIR — sur pertinence uniquement, jamais d'office ──────────────────
  pousse(fragments, "savoir", ".lexique.md", sur(() => base.lexique(scope.projectDir ?? scope.workspaceDir), ""));
  let proc = "";
  try { proc = await base.procedures(scope.workspaceDir, query); } catch { proc = ""; }
  pousse(fragments, "savoir", ".procedures/", proc);

  // ⚠️ ② GOÛT n'a AUCUNE lecture câblée aujourd'hui : il est donc éteint sans
  // condition. `scope.tacheVisuelle` est accepté pour que le contrat de l'API soit
  // complet, mais il ne change encore RIEN — et c'est écrit ici plutôt que suggéré
  // par un `if` qui aurait l'air d'arbitrer. Le brancher (references, taste-refs,
  // design-system) est un geste du lot 4 qui reste à faire.
  const eteints: Etage[] = ["gout"];

  const a = arbitre(fragments, {
    budget: opts.budget ?? BUDGET_DEFAUT,
    total: opts.total,
    compte: opts.compte,
    eteints,
  });

  // On ne journalise QUE l'anomalie. Une ligne à chaque tour deviendrait du bruit,
  // et le bruit est ce qui a permis à la coupe des axiomes de passer inaperçue.
  if (a.incompressibleAmpute) {
    (opts.journalise ?? ((l: string) => console.warn(`[memory] ${l}`)))(
      `étage incompressible amputé — ${resumeArbitrage(a)}`,
    );
  }

  const texte = a.retenus.map((f) => f.texte).join("\n\n");
  return { souvenirs: a.retenus, arbitrage: a, texte };
}
