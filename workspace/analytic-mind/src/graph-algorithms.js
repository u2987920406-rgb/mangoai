// graph-algorithms.js
// Algorithmes de graphe implémentés à la main (aucune lib d'analyse).
// - Degré (in/out/total)
// - Centralité d'intermédiarité : algorithme de BRANDES (betweenness, non pondéré)
// - Détection de clusters : composantes connexes via UNION-FIND (arêtes non orientées)
// - Chemin critique / profondeur : plus long chemin dans le DAG (tri topologique de Kahn)
// - Nœuds orphelins (degré 0) · Densité du graphe dirigé
//
// Toutes les fonctions prennent { nodes: [{id,...}], edges: [{source,target,...}] }.

// ── Adjacence ────────────────────────────────────────────
function buildAdjacency(nodes, edges) {
  const ids = nodes.map((n) => n.id);
  const idx = new Map(ids.map((id, i) => [id, i]));
  const out = new Map(ids.map((id) => [id, []])); // dirigé sortant
  const inc = new Map(ids.map((id) => [id, []])); // dirigé entrant
  const und = new Map(ids.map((id) => [id, new Set()])); // non orienté
  for (const e of edges) {
    if (!idx.has(e.source) || !idx.has(e.target)) continue;
    if (e.source === e.target) continue; // ignore boucles
    out.get(e.source).push(e.target);
    inc.get(e.target).push(e.source);
    und.get(e.source).add(e.target);
    und.get(e.target).add(e.source);
  }
  return { ids, idx, out, inc, und };
}

// ── Degrés ───────────────────────────────────────────────
export function computeDegrees(nodes, edges) {
  const deg = new Map(nodes.map((n) => [n.id, { in: 0, out: 0, total: 0 }]));
  for (const e of edges) {
    if (!deg.has(e.source) || !deg.has(e.target)) continue;
    if (e.source === e.target) continue;
    deg.get(e.source).out += 1;
    deg.get(e.target).in += 1;
    deg.get(e.source).total += 1;
    deg.get(e.target).total += 1;
  }
  return deg;
}

// ── Betweenness centrality — BRANDES (2001), non pondéré ──
// Renvoie une Map id -> score normalisé [0,1].
export function computeBetweenness(nodes, edges) {
  const { ids, und } = buildAdjacency(nodes, edges);
  const CB = new Map(ids.map((id) => [id, 0]));
  if (ids.length < 3) return { scores: normalize(CB, ids), raw: CB };

  for (const s of ids) {
    const stack = [];
    const pred = new Map(ids.map((id) => [id, []]));
    const sigma = new Map(ids.map((id) => [id, 0]));
    const dist = new Map(ids.map((id) => [id, -1]));
    sigma.set(s, 1);
    dist.set(s, 0);
    const queue = [s];
    while (queue.length) {
      const v = queue.shift();
      stack.push(v);
      for (const w of und.get(v)) {
        if (dist.get(w) < 0) {
          dist.set(w, dist.get(v) + 1);
          queue.push(w);
        }
        if (dist.get(w) === dist.get(v) + 1) {
          sigma.set(w, sigma.get(w) + sigma.get(v));
          pred.get(w).push(v);
        }
      }
    }
    const delta = new Map(ids.map((id) => [id, 0]));
    while (stack.length) {
      const w = stack.pop();
      for (const v of pred.get(w)) {
        const c = (sigma.get(v) / sigma.get(w)) * (1 + delta.get(w));
        delta.set(v, delta.get(v) + c);
      }
      if (w !== s) CB.set(w, CB.get(w) + delta.get(w));
    }
  }
  // graphe non orienté : chaque paire comptée deux fois
  for (const id of ids) CB.set(id, CB.get(id) / 2);
  return { scores: normalize(CB, ids), raw: CB };
}

function normalize(map, ids) {
  let max = 0;
  for (const id of ids) max = Math.max(max, map.get(id));
  const norm = new Map();
  for (const id of ids) norm.set(id, max > 0 ? map.get(id) / max : 0);
  return norm;
}

// ── Clusters — composantes connexes (UNION-FIND) ─────────
export function computeClusters(nodes, edges) {
  const parent = new Map(nodes.map((n) => [n.id, n.id]));
  const rank = new Map(nodes.map((n) => [n.id, 0]));
  function find(x) {
    while (parent.get(x) !== x) {
      parent.set(x, parent.get(parent.get(x)));
      x = parent.get(x);
    }
    return x;
  }
  function union(a, b) {
    const ra = find(a);
    const rb = find(b);
    if (ra === rb) return;
    if (rank.get(ra) < rank.get(rb)) parent.set(ra, rb);
    else if (rank.get(ra) > rank.get(rb)) parent.set(rb, ra);
    else {
      parent.set(rb, ra);
      rank.set(ra, rank.get(ra) + 1);
    }
  }
  for (const e of edges) {
    if (!parent.has(e.source) || !parent.has(e.target)) continue;
    union(e.source, e.target);
  }
  // regroupe par racine → id de cluster séquentiel
  const rootToCluster = new Map();
  const clusterOf = new Map();
  let cid = 0;
  for (const n of nodes) {
    const r = find(n.id);
    if (!rootToCluster.has(r)) rootToCluster.set(r, cid++);
    clusterOf.set(n.id, rootToCluster.get(r));
  }
  const sizes = new Map();
  for (const c of clusterOf.values()) sizes.set(c, (sizes.get(c) || 0) + 1);
  return { clusterOf, count: cid, sizes };
}

// ── Chemin critique / profondeur — plus long chemin (DAG) ─
// Tri topologique de Kahn ; si un cycle empêche l'ordre complet,
// on renvoie hasCycle=true et la profondeur sur le sous-DAG traité.
export function computeCriticalPath(nodes, edges) {
  const { ids, out, inc } = buildAdjacency(nodes, edges);
  const indeg = new Map(ids.map((id) => [id, inc.get(id).length]));
  const queue = ids.filter((id) => indeg.get(id) === 0);
  const order = [];
  const q = [...queue];
  while (q.length) {
    const v = q.shift();
    order.push(v);
    for (const w of out.get(v)) {
      indeg.set(w, indeg.get(w) - 1);
      if (indeg.get(w) === 0) q.push(w);
    }
  }
  const hasCycle = order.length < ids.length;

  // plus long chemin en nombre d'arêtes + reconstruction
  const dist = new Map(ids.map((id) => [id, 0]));
  const prev = new Map(ids.map((id) => [id, null]));
  for (const v of order) {
    for (const w of out.get(v)) {
      if (dist.get(v) + 1 > dist.get(w)) {
        dist.set(w, dist.get(v) + 1);
        prev.set(w, v);
      }
    }
  }
  let end = null;
  let maxD = -1;
  for (const id of ids) {
    if (dist.get(id) > maxD) {
      maxD = dist.get(id);
      end = id;
    }
  }
  const path = [];
  let cur = end;
  while (cur !== null) {
    path.unshift(cur);
    cur = prev.get(cur);
  }
  return {
    depth: maxD, // nombre d'arêtes du plus long chemin
    length: path.length, // nombre de nœuds
    path, // liste d'ids
    hasCycle,
  };
}

// ── Orphelins & densité ──────────────────────────────────
export function computeOrphans(nodes, edges) {
  const deg = computeDegrees(nodes, edges);
  return nodes.filter((n) => deg.get(n.id).total === 0).map((n) => n.id);
}

export function computeDensity(nodes, edges) {
  const n = nodes.length;
  if (n < 2) return 0;
  // arêtes uniques dirigées (hors boucles)
  const seen = new Set();
  for (const e of edges) {
    if (e.source === e.target) continue;
    seen.add(`${e.source}->${e.target}`);
  }
  return seen.size / (n * (n - 1));
}

// ── Agrégat — tout en un passage ─────────────────────────
export function analyzeGraph(nodes, edges) {
  const degrees = computeDegrees(nodes, edges);
  const { scores: betweenness, raw: betweennessRaw } = computeBetweenness(nodes, edges);
  const clusters = computeClusters(nodes, edges);
  const critical = computeCriticalPath(nodes, edges);
  const orphans = computeOrphans(nodes, edges);
  const density = computeDensity(nodes, edges);

  // Score d'influence combiné : 0.6*betweenness + 0.4*degré normalisé
  let maxDeg = 0;
  for (const n of nodes) maxDeg = Math.max(maxDeg, degrees.get(n.id).total);
  const influence = new Map();
  for (const n of nodes) {
    const b = betweenness.get(n.id) || 0;
    const d = maxDeg > 0 ? degrees.get(n.id).total / maxDeg : 0;
    influence.set(n.id, 0.6 * b + 0.4 * d);
  }
  const ranked = [...nodes]
    .map((n) => ({ id: n.id, label: n.data?.label ?? n.id, score: influence.get(n.id) }))
    .sort((a, b) => b.score - a.score);
  const topInfluential = ranked.slice(0, 3).filter((r) => r.score > 0);

  return {
    degrees,
    betweenness,
    betweennessRaw,
    clusters,
    critical,
    orphans,
    density,
    influence,
    ranked,
    topInfluential,
    nodeCount: nodes.length,
    edgeCount: edges.length,
  };
}
