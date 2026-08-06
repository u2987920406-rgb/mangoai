// Refonte v3 — lot 3 : le JOURNAL D'ALLUMAGE.
//
// Doc 03 § 4 : « Chaque allumage/extinction d'équipe est journalisé → alimente le
// bandeau de statut UI. » C'est la seule chose que l'utilisateur verra jamais des
// équipes (§ 6) — donc la seule source de ce bandeau, et rien d'autre.
//
// Contraintes tenues ici, volontairement étroites :
//   · EN MÉMOIRE, borné. Un journal qui grossit sans fin est une fuite ; un journal
//     qui écrit sur disque à chaque tour est une I/O sur le chemin chaud.
//   · Ne throw JAMAIS — c'est de l'observation. Un bandeau cassé ne casse pas un build.
//   · Zéro dépendance sur les équipes elles-mêmes : le journal note des identifiants,
//     il ne les valide pas. Sinon il devient un second endroit où la liste vit.

// « pressentie » n'est PAS un synonyme d'« allumée ». Le socle v3 sait déjà décider
// quelles équipes une demande réclame, mais il ne pilote pas encore l'exécution :
// pendant cette phase, il OBSERVE. Journaliser ces décisions sous « allumee » aurait
// fait croire à un travail qui n'a pas eu lieu — un bandeau qui ment est pire qu'un
// bandeau vide. L'état disparaîtra quand le socle pilotera pour de bon.
export type EtatEquipe = "allumee" | "eteinte" | "echec" | "pressentie";

export interface EntreeJournal {
  readonly teamId: string;
  readonly etat: EtatEquipe;
  /** Ce que l'équipe fait, en clair, pour le bandeau : « lecture de cahier.pdf ». */
  readonly detail: string;
  /** Horodatage relatif au démarrage du journal — comparable, et sans fuseau à gérer. */
  readonly atMs: number;
  /** Durée de l'allumage, posée à l'extinction seulement. */
  readonly dureeMs?: number;
}

const MAX_ENTREES = 200;

export class TeamJournal {
  private readonly entrees: EntreeJournal[] = [];
  private readonly debutParEquipe = new Map<string, number>();
  private readonly now: () => number;
  private readonly t0: number;

  /** `now` injectable : un test qui dépend de l'horloge réelle est un test instable. */
  constructor(now: () => number = Date.now) {
    this.now = now;
    this.t0 = now();
  }

  allume(teamId: string, detail = ""): void {
    const at = this.now() - this.t0;
    this.debutParEquipe.set(teamId, at);
    this.pousse({ teamId, etat: "allumee", detail, atMs: at });
  }

  /** Éteint l'équipe. `echec: true` distingue l'extinction propre de l'abandon —
   *  un dépassement de budget est une extinction PROPRE, pas un échec (doc 03 § 4). */
  eteint(teamId: string, detail = "", echec = false): void {
    const at = this.now() - this.t0;
    const debut = this.debutParEquipe.get(teamId);
    this.debutParEquipe.delete(teamId);
    this.pousse({
      teamId,
      etat: echec ? "echec" : "eteinte",
      detail,
      atMs: at,
      dureeMs: debut === undefined ? undefined : at - debut,
    });
  }

  /** Note qu'une équipe AURAIT été allumée, sans qu'elle le soit. N'ouvre aucune
   *  durée : rien ne commence, donc rien ne dure. */
  pressent(teamId: string, detail = ""): void {
    this.pousse({ teamId, etat: "pressentie", detail, atMs: this.now() - this.t0 });
  }

  private pousse(e: EntreeJournal): void {
    this.entrees.push(e);
    // Borne par la TÊTE : on garde les dernières entrées, ce sont celles du bandeau.
    if (this.entrees.length > MAX_ENTREES) this.entrees.splice(0, this.entrees.length - MAX_ENTREES);
  }

  /** Copie défensive : un consommateur ne doit pas pouvoir réécrire le journal. */
  lignes(): readonly EntreeJournal[] {
    return this.entrees.slice();
  }

  /** Les équipes actuellement allumées, dans l'ordre d'allumage. */
  allumees(): string[] {
    return [...this.debutParEquipe.entries()].sort((a, b) => a[1] - b[1]).map(([id]) => id);
  }

  vide(): void {
    this.entrees.length = 0;
    this.debutParEquipe.clear();
  }
}

/** Journal du processus. Un seul — le bandeau est unique (doc 03 § 6). */
export const journalEquipes = new TeamJournal();
