// Refonte v3 — lot 3 : L'ORCHESTRATEUR ÉTEINT LES ÉQUIPES.
//
// Doc 03 § 2, mission de l'🧭 Orchestrateur : « Comprendre la demande, DÉCIDER QUELLES
// ÉQUIPES ALLUMER, synthétiser leurs retours, répondre. » Jusqu'ici `runTour` allumait
// toutes les équipes que l'escalier proposait, et l'Orchestrateur n'orchestrait rien —
// il était une équipe parmi les autres, avec une mission qu'il n'exerçait pas.
//
// ─────────────────────────────────────────────────────────────────────────────
// POURQUOI ÇA NE COÛTE AUCUN APPEL SUPPLÉMENTAIRE
// ─────────────────────────────────────────────────────────────────────────────
// L'Orchestrateur est allumé à chaque tour et parle DÉJÀ, en premier. Son appel est
// donc déjà payé ; c'est sa RÉPONSE qui était jetée. On lui demande simplement de
// répondre à la question qu'il était censé trancher. L'élagage se paie zéro appel et
// en économise autant qu'il éteint d'équipes.
//
// C'est ce qui rend l'arbitrage de Raf (« que l'Orchestrateur éteigne les équipes »)
// strictement meilleur que le statu quo : il n'y a pas d'arbitrage coût/fidélité.
//
// ─────────────────────────────────────────────────────────────────────────────
// LES TROIS RÈGLES, ET POURQUOI ELLES SONT DES RÈGLES
// ─────────────────────────────────────────────────────────────────────────────
// 1. Il ÉLAGUE, il n'AJOUTE jamais. Le choix se fait dans l'ensemble que l'escalier
//    déterministe a proposé, jamais au-delà. Sinon un modèle pourrait rallumer des
//    équipes qu'aucun signal ne réclame, et le coût redeviendrait non borné — la même
//    discipline que « la policy de l'appelant resserre, jamais n'élargit ».
// 2. Il ne peut PAS éteindre 🛡️ Vérification. « Toujours, à la clôture de chaque tour.
//    Non désactivable » (doc 03 § 2). Un jour où un modèle décide que la vérification
//    est superflue est le jour où la promesse produit tombe.
// 3. En cas de doute, ON GARDE TOUT. Réponse illisible, cerveau en panne, liste vide :
//    on retombe sur le comportement d'avant. Dégrader vers « tout exécuter » coûte de
//    l'argent ; dégrader vers « ne rien exécuter » perdrait du travail en silence.

import { TEAMS, type TeamId } from "./teams.js";
import { dispatchTeam, type TeamDispatchOpts, type TeamResult } from "./team-dispatch.js";

/** Ce que l'Orchestrateur a décidé, et ce qui a été réellement appliqué. */
export interface ChoixOrchestrateur {
  readonly gardees: readonly TeamId[];
  readonly eteintes: readonly TeamId[];
  /** false → l'élagage n'a PAS pu être appliqué (réponse illisible, panne, liste vide) :
   *  toutes les candidates sont conservées. Le distinguer d'un élagage à zéro extinction
   *  compte — l'un est une décision, l'autre un repli. */
  readonly applique: boolean;
  /** Pourquoi, en clair — pour le bandeau et pour le diagnostic. */
  readonly motif: string;
}

/** Équipes qu'aucune décision ne peut éteindre. */
function inextinguible(id: TeamId): boolean {
  const a = TEAMS[id].allumage;
  // `cloture` = la Vérification. `inconditionnelle` = l'Orchestrateur lui-même, qui
  // ne peut pas se retirer du tour qu'il est en train d'arbitrer.
  return Boolean(a.cloture) || Boolean(a.inconditionnelle);
}

const CONSIGNE = [
  "Tu arbitres l'allumage des équipes pour CE tour.",
  "",
  "Réponds avec la liste des équipes RÉELLEMENT nécessaires à la demande, dans le champ",
  '`data.equipes` (un tableau d\'identifiants). Toute équipe absente de ta liste sera ÉTEINTE',
  "et ne travaillera pas : chaque équipe gardée coûte un appel modèle et un créneau.",
  "",
  "Règles :",
  "- Tu ne peux que RETIRER des équipes de la liste ci-dessous, jamais en ajouter.",
  "- Garde une équipe dès qu'il y a un doute réel : éteindre à tort coûte plus cher que garder.",
  "- Ne justifie pas dans `data` — mets ta raison en une phrase dans `summary`.",
].join("\n");

function catalogue(candidates: readonly TeamId[]): string {
  return candidates
    .filter((id) => !inextinguible(id))
    .map((id) => `- ${id} — ${TEAMS[id].emoji} ${TEAMS[id].label} : ${TEAMS[id].mission}`)
    .join("\n");
}

/** Extrait une liste d'identifiants d'équipe du `data` rendu par le cerveau. Tolérante
 *  sur la forme (tableau de chaînes, casse, espaces), stricte sur le contenu : tout
 *  identifiant inconnu ou hors candidates est ignoré, jamais deviné. */
function litLaListe(data: Record<string, unknown>, candidates: readonly TeamId[]): TeamId[] | null {
  const brut = data.equipes ?? data.teams ?? data.gardees;
  if (!Array.isArray(brut)) return null;
  const permis = new Set<string>(candidates);
  const out: TeamId[] = [];
  for (const v of brut) {
    if (typeof v !== "string") continue;
    const n = v.trim().toLowerCase();
    // RÈGLE 1 : on n'accepte que ce qui était déjà candidat. Un identifiant inventé
    // ou une équipe non proposée par l'escalier n'entre pas.
    if (permis.has(n) && !out.includes(n as TeamId)) out.push(n as TeamId);
  }
  return out;
}

/**
 * Demande à l'Orchestrateur quelles équipes garder, et applique sa décision sous les
 * trois règles ci-dessus. Ne throw jamais.
 *
 * Renvoie AUSSI son `TeamResult` : c'est l'appel que `runTour` faisait déjà pour
 * l'Orchestrateur, il ne doit pas être payé deux fois.
 */
export async function elague(
  task: string,
  candidates: readonly TeamId[],
  opts: TeamDispatchOpts = {},
): Promise<{ choix: ChoixOrchestrateur; resultat: TeamResult }> {
  const forcees = candidates.filter(inextinguible);
  const elagables = candidates.filter((id) => !inextinguible(id));

  const toutGarder = (motif: string): ChoixOrchestrateur => ({
    gardees: [...candidates],
    eteintes: [],
    applique: false,
    motif,
  });

  const resultat = await dispatchTeam("orchestrateur", CONSIGNE, `${task}\n\n— Équipes candidates —\n${catalogue(candidates)}`, {
    ...opts,
    detail: "arbitrage de l'allumage",
  });

  // RÈGLE 3 — en cas de doute, on garde tout.
  if (resultat.refuse || resultat.status === "error" || resultat.status === "timeout") {
    return { choix: toutGarder(`arbitrage indisponible (${resultat.status}) — toutes les équipes conservées`), resultat };
  }
  const liste = litLaListe(resultat.data, elagables);
  if (liste === null) {
    return { choix: toutGarder("réponse d'arbitrage illisible — toutes les équipes conservées"), resultat };
  }
  if (liste.length === 0 && elagables.length > 0) {
    // Une liste vide veut dire « aucune équipe n'est utile », ce qui n'arrive pas sur
    // une demande réelle : c'est bien plus probablement un modèle qui a mal répondu.
    return { choix: toutGarder("arbitrage vide — refusé, toutes les équipes conservées"), resultat };
  }

  // RÈGLE 2 — les inextinguibles reviennent, quoi qu'il ait répondu. On reconstruit
  // depuis `candidates` pour conserver l'ORDRE du bandeau : un tri par la réponse du
  // modèle ferait dépendre l'ordre d'exécution de sa fantaisie.
  const gardees = candidates.filter((id) => forcees.includes(id) || liste.includes(id));
  const eteintes = candidates.filter((id) => !gardees.includes(id));

  return {
    choix: {
      gardees,
      eteintes,
      applique: true,
      motif: eteintes.length
        ? `${eteintes.length} équipe(s) éteinte(s) : ${eteintes.join(", ")}`
        : "aucune extinction — toutes les candidates sont utiles",
    },
    resultat,
  };
}
