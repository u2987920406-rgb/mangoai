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
  | "local-import-mismatch" // (2026-07-14) build : import/export LOCAL incohérent entre
  // 2 fichiers écrits par l'Élève lui-même (fichier importé inexistant, ou export manquant)
  | "knowledge-gap" // build : usage d'API/lib erroné, sans s'être documenté
  | "wrong-tool" // tâtonnement sur le mauvais outil (run_command shell en boucle)
  | "repetitive-failure" // build cassé + réécritures en boucle sans résoudre l'erreur
  | "flaky-resource" // ressource externe morte (image/URL 404) dans le livrable
  | "wandering" // build vert MAIS sur-exploration (relit/replanifie sans finir)
  | "plateau-iterations" // plafond d'itérations atteint sans finir (tâche trop large)
  | "ambiguous"; // aucun signal franc → (Phase 3) cerveau Stratège local

/** Remède SUGGÉRÉ par classe (label informatif en Phase 0 ; exécuté en Phase 1+). */
export const REMEDY_BY_CLASS: Record<BlockerClass, string> = {
  "none": "—",
  "missing-dependency": "add_dependency(<module>)",
  "local-import-mismatch": "corrige l'import/export exact (fichier + symbole nommés dans le diagnostic)",
  "knowledge-gap": "chercher_web / lire_document / procédure #75",
  "wrong-tool": "réorienter vers read_file/edit_file (pas de shell pour lire)",
  "repetitive-failure": "changer d'approche : lire l'erreur exacte, se documenter (chercher_web) ou déléguer — ne pas re-patcher au hasard",
  "flaky-resource": "réparer la ressource (patron L30) ou substituer",
  "wandering": "ré-ancrer le plan (L17) ou décomposer via delegate",
  "plateau-iterations": "décomposer la tâche en sous-tâches (delegate)",
  "ambiguous": "consulter le cerveau Stratège local (qwythos-tools:q6) — Phase 3",
};

/** Seuil de réécritures (write_file+edit_file) qui, sur build cassé, signe une boucle
 *  de correction stérile (« repetitive-failure ») plutôt qu'un simple tâtonnement.
 *  Élevé exprès : au-dessous, on reste sur « ambiguous » (pas de faux positif). */
export const REPETITIVE_WRITES_MIN = 5;

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

/** (2026-07-14) Détail d'une incohérence d'import/export LOCALE — 2 vraies erreurs Rollup
 *  observées en réel (orbital-control, 2 échecs consécutifs) : un fichier importé qui
 *  n'existe pas (`Could not resolve "./X" from "Y"`), ou une exportation absente
 *  (`"X" is not exported by "Y", imported by "Z"`). PAS le même cas que missing-dependency
 *  (un paquet npm) — `missingModuleName` exclut déjà les chemins relatifs/./ pour cette
 *  raison, ce qui laissait ces erreurs tomber en « ambiguous » sans être jamais nommées. */
export interface LocalImportMismatch {
  kind: "unresolved" | "missing-export";
  symbol?: string; // pour missing-export : le nom exporté manquant
  target: string; // le fichier concerné (à corriger)
  importer?: string; // le fichier qui importe, si l'erreur le précise
}

export function localImportMismatch(detail: string): LocalImportMismatch | null {
  const exp = /["']([^"']+)["']\s+is not exported by\s+["']([^"']+)["'](?:,\s*imported by\s+["']([^"']+)["'])?/i.exec(detail);
  if (exp) return { kind: "missing-export", symbol: exp[1], target: exp[2] as string, importer: exp[3] };

  const unresolved =
    /Could not resolve ["'](\.[^"']+)["'](?:\s+from\s+["']([^"']+)["'])?/i.exec(detail) ??
    /Failed to resolve import ["'](\.[^"']+)["']\s+from\s+["']([^"']+)["']/i.exec(detail);
  if (unresolved) return { kind: "unresolved", target: unresolved[1] as string, importer: unresolved[2] };

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
    const local = localImportMismatch(detail);
    if (local) {
      const cause =
        local.kind === "missing-export"
          ? `« ${local.importer ?? "un fichier"} » importe « ${local.symbol} » depuis « ${local.target} », mais ce fichier ne l'exporte pas`
          : `« ${local.importer ?? "un fichier"} » importe « ${local.target} », qui n'existe pas`;
      return {
        blocker: "local-import-mismatch",
        cause,
        evidence:
          local.kind === "missing-export"
            ? `"${local.symbol}" is not exported by "${local.target}"`
            : `Could not resolve "${local.target}"`,
        remedy: REMEDY_BY_CLASS["local-import-mismatch"],
        detail: local.target,
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
    // Réécriture en boucle SANS cause reconnue ci-dessus : l'Élève patche au hasard
    // (write_file/edit_file en rafale) sans résoudre l'erreur → mur de capacité, pas
    // un simple bug. Nommé AVANT le repli « ambiguous » (récupère des cas ambigus).
    const writes = count(tools, "write_file") + count(tools, "edit_file");
    if (writes >= REPETITIVE_WRITES_MIN) {
      return {
        blocker: "repetitive-failure",
        cause: "réécrit en boucle sans résoudre l'erreur de build",
        evidence: `${writes} écriture(s) (write_file/edit_file), build toujours cassé`,
        remedy: REMEDY_BY_CLASS["repetitive-failure"],
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

// #196 partie C (2026-07-23) — règle des 3 essais (« /investigue »). `relances`/
// `selfRelanceMax` bornent le total des relances d'un tour, toutes causes
// confondues — aucun compteur n'existait par SIGNATURE de blocage. Demande de
// Raf : 3 tentatives CONSÉCUTIVES sur la MÊME classe diagnostiquée (pas 10 au
// global) → on arrête de retenter CE chemin, c'est un problème d'architecture,
// pas un bug à repatcher. Fonction PURE, testable isolément.
export function shouldStopRetrying(consecutiveSameBlocker: number, threshold = 3): boolean {
  return consecutiveSameBlocker >= threshold;
}

/** Ligne lisible « Mango pense à voix haute » (observabilité). */
export function formatDiagnosis(d: Diagnosis): string {
  if (d.blocker === "none") return "";
  return `🧠 Stratège — blocage = ${d.blocker} (${d.cause}) · indice : ${d.evidence} · remède : ${d.remedy}`;
}
