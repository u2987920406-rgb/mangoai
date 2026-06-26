// #164 « Le Stratège » — Phase 0 : CATALOGUE & SIGNAUX (diagnostic déterministe).
//
// Quand l'exécutant (l'Élève) bloque, on veut que MANGO raisonne : d'abord NOMMER
// le blocage à partir de SIGNAUX OBSERVABLES (pas d'un LLM — déterministe, $0 réel,
// zéro cloud). Cette phase est OBSERVE-ONLY : `diagnose` classe le blocage et suggère
// un remède, mais N'AGIT PAS encore (le routage = Phase 1). On la valide en rejouant
// les blocages RÉELS déjà rencontrés (L17 sur-exploration, L30 image morte, dépendance
// manquante, plafond, mauvais outil, manque de doc).
//
// Condition (A) du plan : DÉTERMINISTE d'abord. `diagnose` est une fonction PURE sur
// des signaux ; le cerveau Stratège (gemma4:12b local) n'arrivera qu'en Phase 3, et
// SEULEMENT pour la classe « ambiguous ».

/** Les classes de blocage du catalogue (dérivées de blocages RÉELS). */
export type BlockerClass =
  | "none" // pas de blocage (build vert + finish, rien à signaler)
  | "missing-dependency" // build : module/import introuvable
  | "knowledge-gap" // build : usage d'API/lib erroné, sans s'être documenté
  | "wrong-tool" // tâtonnement sur le mauvais outil (run_command shell en boucle)
  | "flaky-resource" // ressource externe morte (image/URL 404) dans le livrable
  | "wandering" // build vert MAIS sur-exploration (relit/replanifie sans finir)
  | "plateau-iterations" // plafond d'itérations atteint sans finir (tâche trop large)
  | "ambiguous"; // aucun signal franc → (Phase 3) cerveau Stratège local

/** Remède SUGGÉRÉ par classe (label informatif en Phase 0 ; exécuté en Phase 1+). */
export const REMEDY_BY_CLASS: Record<BlockerClass, string> = {
  "none": "—",
  "missing-dependency": "add_dependency(<module>)",
  "knowledge-gap": "chercher_web / lire_document / procédure #75",
  "wrong-tool": "réorienter vers read_file/edit_file (pas de shell pour lire)",
  "flaky-resource": "réparer la ressource (patron L30) ou substituer",
  "wandering": "ré-ancrer le plan (L17) ou décomposer via delegate",
  "plateau-iterations": "décomposer la tâche en sous-tâches (delegate)",
  "ambiguous": "consulter le cerveau Stratège local (gemma4:12b) — Phase 3",
};

/** Signaux observables au point de blocage (tous déjà captés par eleve.ts). */
export interface BlockerSymptoms {
  buildOk: boolean; // inspection.ok
  finished: boolean; // result.finished (l'Élève a appelé finish)
  stuck: boolean; // result.stuck (garde anti-sur-exploration a coupé)
  iterations: number;
  maxIterations?: number; // pour distinguer plateau (plafond) de stuck
  buildDetail?: string; // inspection.detail (sortie/erreur de build)
  toolNames?: string[]; // noms des outils appelés (result.toolTrace)
  task?: string; // la demande (pour repérer une lib citée)
  deadImages?: number; // images mortes non réparables (L30)
}

export interface Diagnosis {
  blocker: BlockerClass;
  cause: string; // explication courte, lisible
  evidence: string; // LE signal qui a tranché (traçabilité)
  remedy: string; // remède suggéré (REMEDY_BY_CLASS, paramétré si possible)
  detail?: string; // donnée extraite utile au remède (ex. nom du module)
}

// ── Extracteurs déterministes ────────────────────────────────────────────────
/** Nom du module manquant depuis une erreur de build (Vite/Rollup/TS/Node). */
export function missingModuleName(detail: string): string | null {
  const pats = [
    /Cannot find module ['"]([^'"]+)['"]/i,
    /Failed to resolve import ['"]([^'"]+)['"]/i,
    /Could not resolve ['"]([^'"]+)['"]/i,
    /Module not found:.*?['"]([^'"]+)['"]/i,
    /Cannot find package ['"]([^'"]+)['"]/i,
  ];
  for (const re of pats) {
    const m = re.exec(detail);
    if (m) {
      // garde le nom de PACKAGE (pas un chemin relatif ./x, qui est un vrai bug code)
      const name = m[1];
      if (name.startsWith(".") || name.startsWith("/")) return null;
      // @scope/pkg ou pkg (sans sous-chemin profond)
      return name.startsWith("@") ? name.split("/").slice(0, 2).join("/") : name.split("/")[0];
    }
  }
  return null;
}

/** Signature d'une erreur d'USAGE (API mal employée) — pointe un manque de doc. */
function looksLikeUsageError(detail: string): boolean {
  return /is not a function|is not defined|has no exported member|is not exported|TypeError:|undefined is not/i.test(detail);
}

function count(names: string[] | undefined, name: string): number {
  return (names ?? []).filter((n) => n === name).length;
}

/** Une lib est-elle citée dans la tâche ? (heuristique légère pour knowledge-gap.) */
function taskCitesLibrary(task: string | undefined, detail: string): boolean {
  if (!task) return false;
  // un identifiant exporté manquant cité dans l'erreur est un bon indice
  return looksLikeUsageError(detail);
}

/**
 * Diagnostic DÉTERMINISTE du blocage. Pur, ne dépend d'aucun modèle/réseau. Ordre :
 * d'abord les causes de BUILD CASSÉ (les plus concrètes), puis les cas BUILD VERT
 * (ressource/dérive/plafond), enfin « none »/« ambiguous ». Ne lève jamais.
 */
export function diagnose(s: BlockerSymptoms): Diagnosis {
  const tools = s.toolNames ?? [];
  const detail = s.buildDetail ?? "";

  // ── Build CASSÉ : on cherche la cause précise ──────────────────────────────
  if (!s.buildOk) {
    const mod = missingModuleName(detail);
    if (mod) {
      return {
        blocker: "missing-dependency",
        cause: `dépendance « ${mod} » non installée`,
        evidence: "erreur de build : module/import introuvable",
        remedy: `add_dependency('${mod}')`,
        detail: mod,
      };
    }
    // tâtonnement shell pour lire (Windows) : run_command répété
    if (count(tools, "run_command") >= 3) {
      return {
        blocker: "wrong-tool",
        cause: "tâtonnement sur le mauvais outil (shell pour lire un fichier)",
        evidence: `run_command appelé ${count(tools, "run_command")}× `,
        remedy: REMEDY_BY_CLASS["wrong-tool"],
      };
    }
    if (taskCitesLibrary(s.task, detail) && !tools.includes("chercher_web")) {
      return {
        blocker: "knowledge-gap",
        cause: "usage d'API/lib erroné, sans s'être documenté",
        evidence: "erreur d'usage + chercher_web jamais appelé",
        remedy: REMEDY_BY_CLASS["knowledge-gap"],
      };
    }
    return {
      blocker: "ambiguous",
      cause: "build cassé sans motif déterministe reconnu",
      evidence: detail ? `détail: ${detail.slice(0, 120)}` : "aucun détail de build",
      remedy: REMEDY_BY_CLASS["ambiguous"],
    };
  }

  // ── Build VERT : ressource / dérive / plafond ──────────────────────────────
  if ((s.deadImages ?? 0) > 0) {
    return {
      blocker: "flaky-resource",
      cause: `${s.deadImages} image(s) morte(s) non réparable(s) dans le livrable`,
      evidence: "contrôle images (L30) : 404 non réparable",
      remedy: REMEDY_BY_CLASS["flaky-resource"],
    };
  }
  if (s.stuck) {
    const reads = count(tools, "read_file") + count(tools, "list_files") + count(tools, "search_code");
    const wrote = tools.includes("write_file") || tools.includes("edit_file");
    return {
      blocker: "wandering",
      cause: wrote
        ? "a écrit des fichiers puis re-explore sans appeler finish"
        : "explore sans produire (sur-exploration)",
      evidence: `stuck=true, ${reads} lecture(s)${wrote ? ", au moins une écriture" : ""}`,
      remedy: REMEDY_BY_CLASS["wandering"],
    };
  }
  if (!s.finished) {
    return {
      blocker: "plateau-iterations",
      cause: "plafond d'itérations atteint sans finir (tâche trop large d'un bloc)",
      evidence: s.maxIterations ? `iterations=${s.iterations}/${s.maxIterations}` : `iterations=${s.iterations}`,
      remedy: REMEDY_BY_CLASS["plateau-iterations"],
    };
  }
  return { blocker: "none", cause: "pas de blocage", evidence: "build vert + finish", remedy: "—" };
}

/** Ligne lisible « Mango pense à voix haute » (observabilité). */
export function formatDiagnosis(d: Diagnosis): string {
  if (d.blocker === "none") return "";
  return `🧠 Stratège — blocage = ${d.blocker} (${d.cause}) · indice : ${d.evidence} · remède : ${d.remedy}`;
}
