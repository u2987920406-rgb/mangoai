// layouts.js — trois dispositions commutables.
// - hierarchical : dagre (tri en couches, respecte le sens des liens)
// - radial       : BFS en couronnes concentriques depuis le nœud le plus central
// - force        : Fruchterman-Reingold simplifié, implémenté à la main
import dagre from 'dagre';

const NODE_W = 210;
const NODE_H = 78;

// ── Hiérarchique (dagre) ─────────────────────────────────
export function layoutHierarchical(nodes, edges, dir = 'TB') {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: dir, nodesep: 55, ranksep: 90, marginx: 40, marginy: 40 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const n of nodes) g.setNode(n.id, { width: NODE_W, height: NODE_H });
  for (const e of edges) g.setEdge(e.source, e.target);
  dagre.layout(g);
  return nodes.map((n) => {
    const p = g.node(n.id);
    return { ...n, position: { x: p.x - NODE_W / 2, y: p.y - NODE_H / 2 } };
  });
}

// ── Radial ───────────────────────────────────────────────
export function layoutRadial(nodes, edges, rootId) {
  if (nodes.length === 0) return nodes;
  const adj = new Map(nodes.map((n) => [n.id, new Set()]));
  for (const e of edges) {
    if (adj.has(e.source) && adj.has(e.target)) {
      adj.get(e.source).add(e.target);
      adj.get(e.target).add(e.source);
    }
  }
  // racine = nœud fourni, sinon le plus connecté
  let root = rootId;
  if (!root || !adj.has(root)) {
    root = nodes[0].id;
    let best = -1;
    for (const n of nodes) {
      const d = adj.get(n.id).size;
      if (d > best) { best = d; root = n.id; }
    }
  }
  // BFS → niveaux
  const level = new Map([[root, 0]]);
  const queue = [root];
  const order = [root];
  while (queue.length) {
    const v = queue.shift();
    for (const w of adj.get(v)) {
      if (!level.has(w)) {
        level.set(w, level.get(v) + 1);
        queue.push(w);
        order.push(w);
      }
    }
  }
  // nœuds non atteints (autres composantes) : niveau max+1
  let maxLevel = 0;
  for (const l of level.values()) maxLevel = Math.max(maxLevel, l);
  for (const n of nodes) if (!level.has(n.id)) { maxLevel += 1; level.set(n.id, maxLevel); order.push(n.id); }

  const byLevel = new Map();
  for (const id of order) {
    const l = level.get(id);
    if (!byLevel.has(l)) byLevel.set(l, []);
    byLevel.get(l).push(id);
  }
  const cx = 600, cy = 480, ring = 190;
  const pos = new Map();
  for (const [l, ring_ids] of byLevel) {
    if (l === 0) { pos.set(ring_ids[0], { x: cx, y: cy }); continue; }
    const r = l * ring;
    const count = ring_ids.length;
    ring_ids.forEach((id, i) => {
      const a = (2 * Math.PI * i) / count - Math.PI / 2;
      pos.set(id, { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
    });
  }
  return nodes.map((n) => ({ ...n, position: pos.get(n.id) || { x: cx, y: cy } }));
}

// ── Force-directed (Fruchterman-Reingold simplifié) ──────
export function layoutForce(nodes, edges, iterations = 320) {
  const n = nodes.length;
  if (n === 0) return nodes;
  const W = 1100, H = 820;
  const area = W * H;
  const k = Math.sqrt(area / n) * 0.85; // distance idéale
  const pos = new Map();
  // seed déterministe (cercle) pour un rendu reproductible
  nodes.forEach((nd, i) => {
    const a = (2 * Math.PI * i) / n;
    pos.set(nd.id, {
      x: W / 2 + (W / 3) * Math.cos(a) + (i % 3) * 7,
      y: H / 2 + (H / 3) * Math.sin(a) + (i % 5) * 5,
    });
  });
  const edgeList = edges
    .filter((e) => pos.has(e.source) && pos.has(e.target) && e.source !== e.target)
    .map((e) => [e.source, e.target]);

  let temp = W / 8;
  const cool = temp / (iterations + 1);
  for (let it = 0; it < iterations; it++) {
    const disp = new Map(nodes.map((nd) => [nd.id, { x: 0, y: 0 }]));
    // répulsion (O(n²), acceptable pour graphes de travail)
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = nodes[i].id, b = nodes[j].id;
        const pa = pos.get(a), pb = pos.get(b);
        let dx = pa.x - pb.x, dy = pa.y - pb.y;
        let dsq = dx * dx + dy * dy;
        if (dsq < 0.01) { dx = (Math.random() - 0.5); dy = (Math.random() - 0.5); dsq = 0.01; }
        const dionvv = Math.sqrt(dsq);
        const force = (k * k) / dionvv;
        const fx = (dx / dionvv) * force, fy = (dy / dionvv) * force;
        disp.get(a).x += fx; disp.get(a).y += fy;
        disp.get(b).x -= fx; disp.get(b).y -= fy;
      }
    }
    // attraction (arêtes)
    for (const [a, b] of edgeList) {
      const pa = pos.get(a), pb = pos.get(b);
      let dx = pa.x - pb.x, dy = pa.y - pb.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const force = (dist * dist) / k;
      const fx = (dx / dist) * force, fy = (dy / dist) * force;
      disp.get(a).x -= fx; disp.get(a).y -= fy;
      disp.get(b).x += fx; disp.get(b).y += fy;
    }
    // centrage léger + application bornée par température
    for (const nd of nodes) {
      const d = disp.get(nd.id);
      const p = pos.get(nd.id);
      const len = Math.sqrt(d.x * d.x + d.y * d.y) || 0.01;
      p.x += (d.x / len) * Math.min(len, temp);
      p.y += (d.y / len) * Math.min(len, temp);
      // gravité vers le centre
      p.x += (W / 2 - p.x) * 0.012;
      p.y += (H / 2 - p.y) * 0.012;
      // bornage : empêche un orphelin de fuir à l'infini et de fausser l'échelle
      p.x = Math.max(20, Math.min(W - 20, p.x));
      p.y = Math.max(20, Math.min(H - 20, p.y));
    }
    temp -= cool;
  }
  // Normalisation : la simulation peut dériver largement ; on reprojette dans
  // une boîte cible bornée pour un cadrage fiable (évite un zoom clampé au min).
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const nd of nodes) {
    const p = pos.get(nd.id);
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  const spanX = maxX - minX || 1, spanY = maxY - minY || 1;
  const TARGET = 1150; // largeur/hauteur max visée
  const scale = Math.min(TARGET / spanX, TARGET / spanY, 1.6);
  return nodes.map((nd) => {
    const p = pos.get(nd.id);
    return { ...nd, position: { x: (p.x - minX) * scale, y: (p.y - minY) * scale } };
  });
}

export function applyLayout(name, nodes, edges, opts = {}) {
  switch (name) {
    case 'hierarchical': return layoutHierarchical(nodes, edges, opts.dir || 'TB');
    case 'radial': return layoutRadial(nodes, edges, opts.rootId);
    case 'force': return layoutForce(nodes, edges);
    default: return nodes;
  }
}
