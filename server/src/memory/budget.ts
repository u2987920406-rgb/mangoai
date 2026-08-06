// Refonte v3 — lot 4 : L'ARBITRAGE DU BUDGET DE RAPPEL.
//
// C'est la pièce que le doc 05 § 1.3 désigne comme manquante, et c'est la seule qui
// compte vraiment : aujourd'hui aucune couche ne répond à « j'ai 8 000 tokens pour du
// souvenir — lesquels valent le coup ? ». Chaque magasin s'injecte ou non selon son
// propre code, sans priorité commune.
//
// ─────────────────────────────────────────────────────────────────────────────
// CE QU'ON A MESURÉ, ET QUI DICTE LA FORME DE CE FICHIER
// ─────────────────────────────────────────────────────────────────────────────
// `workspace/.axioms.md` : 273 859 caractères pour un cap de 3 000. Seuls 1,1 %
// étaient injectés — et toujours les MÊMES, les plus anciens, parce que la troncature
// gardait le début du fichier. 98,9 % de ce que le système avait appris était écrit et
// jamais relu. Personne ne l'a vu pendant deux mois, parce que **la coupe ne disait
// rien**.
//
// D'où la règle qui structure tout ce module : **une coupe se déclare.** Un arbitrage
// rend toujours ce qu'il a écarté et pourquoi. Un budget qui déborde en silence est un
// bug qui met deux mois à se voir.
//
// PUR : zéro I/O, zéro horloge, zéro appel modèle. C'est ce qui le rend prouvable.

/** Les quatre étages du doc 05 § 2.2, dans leur ordre de priorité. */
export type Etage = "identite" | "gout" | "projet" | "savoir";

export interface Fragment {
  readonly etage: Etage;
  /** D'où vient ce souvenir — `.axioms.md`, `.lexique.md`, blackboard… Toujours
   *  renseigné : un souvenir dont on ignore l'origine n'est pas corrigeable, et le
   *  doc 05 § 4 en fait une exigence produit (« chaque ligne indique d'où elle vient »). */
  readonly source: string;
  readonly texte: string;
}

/** Ce qu'un étage a le droit de coûter. Voir `BUDGET_DEFAUT` pour les valeurs du doc 05. */
export type Budget = Readonly<Record<Etage, number>>;

/** Budget de référence (doc 05 § 2.3) — 8 000 tokens au total. */
export const BUDGET_DEFAUT: Budget = Object.freeze({
  identite: 2000,
  gout: 1500,
  projet: 2000,
  savoir: 2500,
});

/**
 * Étages qui ne peuvent JAMAIS être coupés en silence (doc 05 § 2.3).
 *
 * « Jamais coupés en silence » ne veut pas dire « jamais coupés » : un budget est un
 * budget. Ça veut dire qu'un dépassement sur ces étages est **signalé explicitement**
 * au lieu d'être absorbé. C'est exactement la différence entre ce module et le
 * `capRegistry` d'avant le 2026-08-06.
 */
const INCOMPRESSIBLES: readonly Etage[] = ["identite", "projet"];

/** Ordre dans lequel on rétrécit quand le total déborde : le Savoir d'abord, le Goût
 *  ensuite. Jamais l'Identité ni le Projet. */
const ORDRE_DE_RETRAIT: readonly Etage[] = ["savoir", "gout"];

export interface Coupe {
  readonly etage: Etage;
  readonly source: string;
  /** Tokens écartés. */
  readonly tokens: number;
  readonly motif: "budget-etage" | "budget-total" | "etage-eteint";
}

export interface Arbitrage {
  /** Ce qui est retenu, dans l'ordre des étages. */
  readonly retenus: readonly Fragment[];
  /** Ce qui a été écarté, et pourquoi. JAMAIS vide en silence. */
  readonly coupes: readonly Coupe[];
  readonly tokensRetenus: number;
  /** Vrai si un étage INCOMPRESSIBLE a dû être amputé — anomalie à journaliser,
   *  pas un fonctionnement normal. */
  readonly incompressibleAmpute: boolean;
}

export interface OptionsArbitrage {
  readonly budget?: Budget;
  /** Plafond global. Absent → somme des étages. Sert quand l'appelant dispose de moins
   *  que le budget nominal (contexte déjà bien rempli). */
  readonly total?: number;
  /** Étages éteints pour ce tour — ② Goût ne s'allume que sur tâche visuelle. */
  readonly eteints?: readonly Etage[];
  /** Compteur de tokens. Injectable : le vrai (`estimateTokens`) fait un travail
   *  réel de segmentation, un test n'a pas à en dépendre. */
  readonly compte?: (texte: string) => number;
}

const ORDRE_ETAGES: readonly Etage[] = ["identite", "gout", "projet", "savoir"];

/** Compteur par défaut, volontairement grossier — l'appelant injecte le vrai. */
const compteApprox = (texte: string): number => Math.ceil(texte.length / 4);

/**
 * Arbitre quels fragments entrent dans le budget, et **déclare tout ce qu'il écarte**.
 *
 * Trois passes, dans cet ordre :
 *   1. les étages éteints sortent (motif `etage-eteint`) ;
 *   2. chaque étage est borné à SON budget — au sein d'un étage, les fragments arrivent
 *      dans l'ordre que l'appelant a choisi, et ce sont les DERNIERS qui tombent ;
 *   3. si le total déborde encore, on rétrécit `savoir` puis `gout` — jamais les
 *      incompressibles. S'il faut malgré tout les amputer, `incompressibleAmpute`
 *      passe à `true` : c'est une anomalie, pas un fonctionnement.
 *
 * PUR.
 */
export function arbitre(fragments: readonly Fragment[], opts: OptionsArbitrage = {}): Arbitrage {
  const budget = opts.budget ?? BUDGET_DEFAUT;
  const compte = opts.compte ?? compteApprox;
  const eteints = new Set(opts.eteints ?? []);
  const total = opts.total ?? ORDRE_ETAGES.reduce((s, e) => s + budget[e], 0);

  const coupes: Coupe[] = [];
  const retenusParEtage = new Map<Etage, Fragment[]>();
  const coutParEtage = new Map<Etage, number>();

  // ── Passes 1 et 2 : extinction, puis budget de chaque étage ──────────────────
  for (const etage of ORDRE_ETAGES) {
    const duLot = fragments.filter((f) => f.etage === etage);
    if (!duLot.length) continue;

    if (eteints.has(etage)) {
      for (const f of duLot) coupes.push({ etage, source: f.source, tokens: compte(f.texte), motif: "etage-eteint" });
      continue;
    }

    const gardes: Fragment[] = [];
    let cout = 0;
    for (const f of duLot) {
      const c = compte(f.texte);
      if (cout + c <= budget[etage]) { gardes.push(f); cout += c; }
      else coupes.push({ etage, source: f.source, tokens: c, motif: "budget-etage" });
    }
    retenusParEtage.set(etage, gardes);
    coutParEtage.set(etage, cout);
  }

  // ── Passe 3 : le plafond GLOBAL, en rétrécissant dans l'ordre prévu ──────────
  let cumul = [...coutParEtage.values()].reduce((s, n) => s + n, 0);
  let incompressibleAmpute = false;

  const rogner = (etage: Etage) => {
    const gardes = retenusParEtage.get(etage);
    if (!gardes?.length) return;
    // On retire par la FIN : au sein d'un étage, l'appelant a rangé le plus
    // important en tête. C'est sa responsabilité, pas celle de l'arbitre — qui
    // n'a aucun moyen de juger de la pertinence d'un texte.
    while (gardes.length && cumul > total) {
      const perdu = gardes.pop()!;
      const c = compte(perdu.texte);
      cumul -= c;
      coutParEtage.set(etage, (coutParEtage.get(etage) ?? 0) - c);
      coupes.push({ etage, source: perdu.source, tokens: c, motif: "budget-total" });
    }
  };

  for (const etage of ORDRE_DE_RETRAIT) { if (cumul > total) rogner(etage); }

  // Dernier recours : les incompressibles. On le FAIT (un budget reste un budget)
  // mais on le SIGNALE — c'est toute la différence avec la troncature d'avant.
  if (cumul > total) {
    for (const etage of INCOMPRESSIBLES) {
      if (cumul <= total) break;
      const avant = retenusParEtage.get(etage)?.length ?? 0;
      rogner(etage);
      if ((retenusParEtage.get(etage)?.length ?? 0) < avant) incompressibleAmpute = true;
    }
  }

  const retenus = ORDRE_ETAGES.flatMap((e) => retenusParEtage.get(e) ?? []);
  return {
    retenus,
    coupes,
    tokensRetenus: retenus.reduce((s, f) => s + compte(f.texte), 0),
    incompressibleAmpute,
  };
}

/**
 * Rend l'arbitrage lisible par un humain — pour le journal et pour l'écran Mémoire.
 * Un arbitrage qu'on ne peut pas lire est un arbitrage qu'on ne peut pas corriger,
 * et le doc 05 § 4 en fait un principe produit.
 */
export function resumeArbitrage(a: Arbitrage): string {
  if (!a.coupes.length) return `${a.tokensRetenus} tokens retenus, rien d'écarté.`;
  const parMotif = new Map<string, number>();
  for (const c of a.coupes) parMotif.set(c.motif, (parMotif.get(c.motif) ?? 0) + c.tokens);
  const detail = [...parMotif.entries()].map(([m, t]) => `${t} (${m})`).join(" · ");
  const alerte = a.incompressibleAmpute ? " ⚠️ un étage INCOMPRESSIBLE a été amputé" : "";
  return `${a.tokensRetenus} tokens retenus, ${a.coupes.length} fragment(s) écarté(s) : ${detail}.${alerte}`;
}
