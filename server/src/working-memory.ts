// État de travail structuré (B0.2, gate ELEVE_ETAT) — un résumé COMPACT et DÉDUIT
// de la boucle agentique (aucune question posée au modèle), réinjecté quand la
// compaction de contexte (eleve-runtime.compact) tronque les vieux résultats
// d'outils. Sans lui, une longue boucle compactée perd la trace de « qu'est-ce
// qui a déjà été écrit / quelle était la dernière erreur » — le modèle re-explore
// ou re-écrit à l'aveugle. Module PUR (aucun I/O, aucun réseau) → testable seul.

/** Outils d'écriture reconnus pour extraire un chemin de fichier des arguments.
 * Dupliqué (volontairement) de la liste WRITE_TOOLS d'eleve-runtime : ce module
 * reste indépendant du runtime (pas d'import croisé) pour rester pur/testable. */
const WRITE_TOOLS_FOR_STATE = new Set(["write_file", "edit_file"]);

/** État de travail déduit de la boucle — jamais demandé au modèle. */
export interface WorkingState {
  /** Chemins de fichiers écrits/édités avec succès ce run (dédupliqués, en ordre). */
  fichiersEcrits: string[];
  /** Dernier échec d'outil observé (résumé court), s'il y en a eu un. */
  derniereErreur?: string;
  /** Dernier rappel de plan connu (peut être vide/absent si l'Élève n'a pas de plan). */
  planRappel?: string;
  /** Nombre total d'appels d'outils traités ce run. */
  nbOutils: number;
}

/** État de travail initial (début de run). */
export function emptyWorkingState(): WorkingState {
  return { fichiersEcrits: [], nbOutils: 0 };
}

/**
 * Accumule UN événement (un appel d'outil) dans l'état de travail. Pure : ne
 * mute jamais `prev`, renvoie un nouvel objet. `toolArgs` = arguments DÉJÀ
 * parsés (l'appelant gère un JSON invalide en amont) ; `planReminder` = le
 * rappel de plan courant (`opts.planReminder?.()`), `undefined` si l'appelant
 * n'en a pas fourni (dans ce cas on garde le dernier rappel connu).
 */
export function updateWorkingState(
  prev: WorkingState,
  toolName: string,
  toolArgs: Record<string, unknown>,
  isError: boolean,
  planReminder?: string,
): WorkingState {
  const next: WorkingState = {
    fichiersEcrits: [...prev.fichiersEcrits],
    derniereErreur: prev.derniereErreur,
    planRappel: planReminder !== undefined ? planReminder : prev.planRappel,
    nbOutils: prev.nbOutils + 1,
  };
  if (!isError && WRITE_TOOLS_FOR_STATE.has(toolName)) {
    const p = typeof toolArgs.path === "string" ? toolArgs.path : undefined;
    if (p && !next.fichiersEcrits.includes(p)) next.fichiersEcrits.push(p);
  }
  if (isError) {
    next.derniereErreur = `${toolName} a échoué`;
  }
  return next;
}

/** Cap dur (comme les axiomes) : jamais de dépassement, même si tous les champs
 * sont pleins — un état de travail ne doit jamais devenir un 2e contexte lourd. */
const DEFAULT_MAX_CHARS = 600;

/**
 * Formate l'état de travail en UNE ligne system compacte, BORNÉE à `maxChars`.
 * Toujours la même forme, pour que le modèle apprenne à la reconnaître.
 */
export function formatWorkingState(state: WorkingState, maxChars = DEFAULT_MAX_CHARS): string {
  const parts: string[] = ["ÉTAT DE TRAVAIL :"];
  parts.push(
    state.fichiersEcrits.length > 0
      ? `fichiers déjà écrits : ${state.fichiersEcrits.join(", ")}`
      : "aucun fichier écrit pour l'instant",
  );
  if (state.planRappel) parts.push(`plan : ${state.planRappel}`);
  if (state.derniereErreur) parts.push(`dernier blocage : ${state.derniereErreur}`);
  parts.push(`(${state.nbOutils} outil${state.nbOutils > 1 ? "s" : ""} appelé${state.nbOutils > 1 ? "s" : ""} ce run)`);
  let line = parts.join(" / ");
  if (line.length > maxChars) {
    line = line.slice(0, Math.max(0, maxChars - 14)) + " …[tronqué]";
  }
  return line;
}
