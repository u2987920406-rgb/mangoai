// Moteur de workflow côté Élève (inspiré de `harnais-2027/src/core/workflow.ts` —
// graphe de nœuds + tri topologique — réimplémenté sans dépendance).
//
// Étend le remède de la classe `plateau-iterations` du Stratège (stratege-brain.ts,
// BRAIN_CATALOGUE : "tâche trop large d'un bloc, à décomposer (delegate)") : ce
// remède restait une SUGGESTION textuelle affichée à l'Élève, jamais un mécanisme
// réel de décomposition + orchestration. Ce module fournit ce mécanisme :
//   1. Un graphe de sous-tâches (nœuds) + dépendances (arêtes).
//   2. Un tri topologique (Kahn) en NIVEAUX — les nœuds d'un même niveau n'ont
//      aucune dépendance entre eux → exécutables en parallèle.
//   3. Une exécution niveau par niveau via une fonction `delegate` INJECTÉE
//      (comme `StrategeDispatch`/`MemoireDeps`/`FabriqueDeps` ailleurs dans ce
//      repo) — ce module ne connaît PAS `runAgenticTask`/`AgenticRunCtx`
//      (eleve-runtime.ts), il reste pur et testable sans réseau. Le branchement
//      vers le VRAI outil `delegate` (eleve-runtime.ts) est un adaptateur mince
//      à écrire séparément, pas encore câblé au chemin de production.
//
// Ne lève jamais : un cycle détecté ou un nœud en échec sont des résultats,
// pas des exceptions — cohérent avec le reste du Stratège (`reclassifyAmbiguous`
// ne lève jamais non plus).

/** Un sous-nœud du workflow : une sous-tâche + ses dépendances (ids d'autres nœuds). */
export interface WorkflowNode {
  id: string;
  task: string;
  dependsOn?: string[];
}

export interface WorkflowDef {
  nodes: WorkflowNode[];
}

/** Résultat d'un nœud délégué. */
export interface NodeResult {
  id: string;
  ok: boolean;
  summary: string;
}

/** Fonction de délégation injectée — signature volontairement minimale et pure
 *  côté appelant. L'adaptateur réel vers l'outil `delegate` d'eleve-runtime.ts
 *  encapsulera `runAgenticTask`/`AgenticRunCtx` derrière cette même signature. */
export type DelegateFn = (task: string, nodeId: string) => Promise<NodeResult>;

export interface WorkflowRunResult {
  ok: boolean;
  /** Résultats par id de nœud, dans l'ordre d'exécution (niveau par niveau). */
  results: NodeResult[];
  /** Niveaux exécutés (pour l'observabilité — un niveau = nœuds lancés en parallèle). */
  levels: string[][];
  /** Non-vide UNIQUEMENT si un cycle a empêché tout tri (aucun nœud exécuté). */
  cycleError?: string;
}

/**
 * Tri topologique de Kahn en NIVEAUX (pas juste une liste plate) : chaque niveau
 * est un ensemble de nœuds dont TOUTES les dépendances ont déjà été résolues par
 * les niveaux précédents — donc exécutables en parallèle entre eux.
 * Renvoie `null` si le graphe contient un cycle (jamais de throw).
 */
export function topoSortLevels(def: WorkflowDef): string[][] | null {
  const byId = new Map(def.nodes.map((n) => [n.id, n]));
  const indegree = new Map<string, number>();
  for (const n of def.nodes) indegree.set(n.id, 0);
  for (const n of def.nodes) {
    for (const dep of n.dependsOn ?? []) {
      if (!byId.has(dep)) continue; // dépendance inconnue → ignorée (fail-open)
      indegree.set(n.id, (indegree.get(n.id) ?? 0) + 1);
    }
  }

  const levels: string[][] = [];
  const done = new Set<string>();
  let remaining = def.nodes.length;

  while (remaining > 0) {
    const level = def.nodes
      .filter((n) => !done.has(n.id) && (indegree.get(n.id) ?? 0) === 0)
      .map((n) => n.id);
    if (level.length === 0) return null; // cycle : plus aucun nœud à indegree 0
    levels.push(level);
    for (const id of level) {
      done.add(id);
      remaining--;
    }
    // Décrémente l'indegree des nœuds dépendant d'un id fraîchement résolu.
    for (const n of def.nodes) {
      if (done.has(n.id)) continue;
      if ((n.dependsOn ?? []).some((d) => level.includes(d))) {
        indegree.set(n.id, (indegree.get(n.id) ?? 0) - 1);
      }
    }
  }
  return levels;
}

/**
 * Exécute le workflow niveau par niveau (parallèle intra-niveau, séquentiel
 * inter-niveaux). Un nœud en échec (ok=false) n'empêche PAS les autres nœuds du
 * MÊME niveau de tourner (déjà lancés en parallèle) mais les niveaux suivants
 * qui en dépendraient s'exécutent quand même — le contrat de `DelegateFn` est
 * de ne jamais lever ; c'est à l'appelant de décider si un `ok=false` bloque la
 * suite (ce moteur reste un simple exécuteur de graphe, pas un juge de succès).
 */
export async function runWorkflow(def: WorkflowDef, delegate: DelegateFn): Promise<WorkflowRunResult> {
  const levels = topoSortLevels(def);
  if (!levels) {
    return { ok: false, results: [], levels: [], cycleError: "cycle détecté dans le graphe de sous-tâches" };
  }
  const byId = new Map(def.nodes.map((n) => [n.id, n]));
  const results: NodeResult[] = [];
  for (const level of levels) {
    const levelResults = await Promise.all(
      level.map(async (id) => {
        const node = byId.get(id)!;
        try {
          return await delegate(node.task, id);
        } catch {
          return { id, ok: false, summary: "delegate a levé (capté — ne devrait jamais arriver)" };
        }
      }),
    );
    results.push(...levelResults);
  }
  return { ok: results.every((r) => r.ok), results, levels };
}
