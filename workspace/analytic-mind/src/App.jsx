// ============================================================================
// ANALYTIC MIND
// ANGLE : « Pas un mindmap décoratif — un atelier de pensée qui s'analyse
// lui-même. » Chaque édition relance une passe d'analyse structurelle
// (centralité de Brandes, clusters union-find, chemin critique) : la carte
// ne se contente pas de montrer des idées, elle mesure comment elles tiennent.
//
// palette anchor: deep ink cognition — encre profonde #0f1117 + UN accent
// électrique (cyan #22d3ee) + true greys. Nœuds typés par couleur sémantique
// (concept / question / preuve / risque). Paire typo : Space Grotesk (grotesque
// net) + JetBrains Mono (mono tabular pour toutes les métriques).
// ============================================================================
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow, ReactFlowProvider, Background, Controls, MiniMap, Panel,
  addEdge, applyNodeChanges, applyEdgeChanges, useReactFlow,
  getNodesBounds, getViewportForBounds, MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { toPng } from 'html-to-image';

import AnalyticNode from './AnalyticNode';
import AnalyticsPanel from './AnalyticsPanel';
import { GraphActions } from './graph-actions';
import { NODE_TYPES, EDGE_TYPES, EXAMPLE_NODES, EXAMPLE_EDGES } from './example-data';
import { analyzeGraph } from './graph-algorithms';
import { applyLayout } from './layouts';

const nodeTypes = { analytic: AnalyticNode };
const STORAGE_KEY = 'analytic-mind:v1';
const LAYOUTS = [
  { id: 'hierarchical', label: 'Hiérarchique', hint: 'dagre' },
  { id: 'force', label: 'Force', hint: 'Fruchterman-Reingold' },
  { id: 'radial', label: 'Radial', hint: 'BFS couronnes' },
];

const clone = (x) => JSON.parse(JSON.stringify(x));
const stripNode = (n) => ({ id: n.id, type: n.type, position: n.position, data: { type: n.data.type, label: n.data.label, desc: n.data.desc || '' } });
const stripEdge = (e) => ({ id: e.id, source: e.source, target: e.target, data: { rel: e.data?.rel || 'cause' } });

function loadInitial() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (Array.isArray(p.nodes)) return { nodes: p.nodes, edges: p.edges || [] };
    }
  } catch { /* ignore */ }
  return {
    nodes: applyLayout('hierarchical', clone(EXAMPLE_NODES), EXAMPLE_EDGES),
    edges: clone(EXAMPLE_EDGES),
  };
}

let idSeq = Date.now() % 100000;
const nextId = (p) => `${p}${idSeq++}`;

const isNarrow = () => typeof window !== 'undefined' && window.innerWidth < 760;
// Réserve la place des panneaux flottants (barre gauche / analyse droite) au
// centrage, pour qu'aucun nœud ne finisse masqué derrière eux. Symétrique et
// resserré sur petits écrans où les panneaux démarrent repliés.
const FIT_PAD = () => (isNarrow()
  ? { top: '32px', right: '24px', bottom: '32px', left: '24px' }
  : { top: '48px', right: '312px', bottom: '48px', left: '292px' });

function Workshop() {
  const rf = useReactFlow();
  const init = useMemo(loadInitial, []);
  const [nodes, setNodes] = useState(init.nodes);
  const [edges, setEdges] = useState(init.edges);
  const nodesRef = useRef(nodes); nodesRef.current = nodes;
  const edgesRef = useRef(edges); edgesRef.current = edges;

  const [layout, setLayout] = useState('hierarchical');
  const [relType, setRelType] = useState('cause');
  const [addType, setAddType] = useState('concept');
  const [search, setSearch] = useState('');
  const [activeTypes, setActiveTypes] = useState(new Set(['concept', 'question', 'preuve', 'risque']));
  const [focusId, setFocusId] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [panelCollapsed, setPanelCollapsed] = useState(isNarrow());
  const [toolOpen, setToolOpen] = useState(!isNarrow());

  // ── Historique undo/redo ────────────────────────────────
  const past = useRef([]);
  const future = useRef([]);
  const [, setHistTick] = useState(0);
  const snapshot = useCallback(() => {
    past.current.push({ nodes: clone(nodesRef.current), edges: clone(edgesRef.current) });
    if (past.current.length > 120) past.current.shift();
    future.current = [];
    setHistTick((t) => t + 1);
  }, []);
  const undo = useCallback(() => {
    if (!past.current.length) return;
    future.current.push({ nodes: clone(nodesRef.current), edges: clone(edgesRef.current) });
    const s = past.current.pop();
    setNodes(s.nodes); setEdges(s.edges); setHistTick((t) => t + 1);
  }, []);
  const redo = useCallback(() => {
    if (!future.current.length) return;
    past.current.push({ nodes: clone(nodesRef.current), edges: clone(edgesRef.current) });
    const s = future.current.pop();
    setNodes(s.nodes); setEdges(s.edges); setHistTick((t) => t + 1);
  }, []);

  // ── Persistance ─────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          nodes: nodes.map(stripNode), edges: edges.map(stripEdge),
        }));
      } catch { /* quota */ }
    }, 400);
    return () => clearTimeout(t);
  }, [nodes, edges]);

  // ── Analyse temps réel ──────────────────────────────────
  const analysis = useMemo(() => {
    const a = analyzeGraph(nodes, edges);
    a.labelById = new Map(nodes.map((n) => [n.id, n.data.label]));
    a.nodeTypeById = new Map(nodes.map((n) => [n.id, n.data.type]));
    return a;
  }, [nodes, edges]);

  // ── Voisinage pour le focus ─────────────────────────────
  const focusSet = useMemo(() => {
    if (!focusId) return null;
    const s = new Set([focusId]);
    for (const e of edges) {
      if (e.source === focusId) s.add(e.target);
      if (e.target === focusId) s.add(e.source);
    }
    return s;
  }, [focusId, edges]);

  const topSet = useMemo(() => new Set(analysis.topInfluential.map((r) => r.id)), [analysis]);
  const q = search.trim().toLowerCase();

  const matches = useCallback((n) => {
    if (!n || !n.data) return false;
    if (!activeTypes.has(n.data.type)) return false;
    if (q && !(`${n.data.label} ${n.data.desc || ''}`.toLowerCase().includes(q))) return false;
    return true;
  }, [activeTypes, q]);

  // ── Nœuds enrichis pour l'affichage ─────────────────────
  const displayNodes = useMemo(() => nodes.map((n) => {
    const passes = matches(n);
    const inFocus = !focusSet || focusSet.has(n.id);
    const dimmed = !passes || !inFocus;
    return {
      ...n,
      data: {
        ...n.data,
        __centrality: analysis.betweenness.get(n.id) ?? 0,
        __influential: topSet.has(n.id),
        __dimmed: dimmed,
      },
    };
  }), [nodes, analysis, matches, focusSet, topSet]);

  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  const displayEdges = useMemo(() => edges.map((e) => {
    const cfg = EDGE_TYPES[e.data?.rel] || EDGE_TYPES.cause;
    const inFocus = !focusSet || (focusSet.has(e.source) && focusSet.has(e.target));
    const brightEnds = matches(nodeById.get(e.source)) && matches(nodeById.get(e.target));
    const dim = !inFocus || !brightEnds;
    return {
      ...e,
      type: 'default',
      animated: cfg.animated && !dim,
      markerEnd: { type: MarkerType.ArrowClosed, color: cfg.color, width: 15, height: 15 },
      style: {
        stroke: cfg.color,
        strokeWidth: 1.6,
        strokeDasharray: cfg.dash || undefined,
        // 0.6 : les liens structurent sans rivaliser avec les nœuds —
        // la hiérarchie visuelle reste aux cartes, pas aux traits.
        opacity: dim ? 0.08 : 0.6,
      },
    };
  }), [edges, focusSet, matches, nodeById]);

  // ── Handlers React Flow ─────────────────────────────────
  const onNodesChange = useCallback((changes) => setNodes((nds) => applyNodeChanges(changes, nds)), []);
  const onEdgesChange = useCallback((changes) => setEdges((eds) => applyEdgeChanges(changes, eds)), []);
  const onNodeDragStart = useCallback(() => snapshot(), [snapshot]);

  const onConnect = useCallback((params) => {
    snapshot();
    setEdges((eds) => addEdge({ ...params, id: nextId('e'), data: { rel: relType } }, eds));
  }, [relType, snapshot]);

  const onNodeClick = useCallback((_, node) => {
    setSelectedId(node.id);
    setFocusId(node.id);
  }, []);
  const onPaneClick = useCallback(() => { setFocusId(null); setSelectedId(null); }, []);

  // ── Actions ─────────────────────────────────────────────
  const commitLabel = useCallback((id, label) => {
    snapshot();
    setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, label } } : n)));
  }, [snapshot]);

  const addNode = useCallback((type) => {
    snapshot();
    const id = nextId('n');
    let pos = { x: 300, y: 260 };
    try {
      const { x, y, zoom } = rf.getViewport();
      const w = window.innerWidth, h = window.innerHeight;
      pos = { x: (-x + w / 2) / zoom - 90, y: (-y + h / 2) / zoom - 30 };
    } catch { /* fallback */ }
    setNodes((nds) => [...nds, {
      id, type: 'analytic', position: pos,
      data: { type, label: `${NODE_TYPES[type].label} sans titre`, desc: '' },
    }]);
    setSelectedId(id);
  }, [rf, snapshot]);

  const deleteSelected = useCallback(() => {
    const ids = nodesRef.current.filter((n) => n.selected).map((n) => n.id);
    const eids = edgesRef.current.filter((e) => e.selected).map((e) => e.id);
    if (!ids.length && !eids.length) return;
    snapshot();
    const idSet = new Set(ids);
    const eidSet = new Set(eids);
    setNodes((nds) => nds.filter((n) => !idSet.has(n.id)));
    setEdges((eds) => eds.filter((e) => !idSet.has(e.source) && !idSet.has(e.target) && !eidSet.has(e.id)));
    setFocusId(null); setSelectedId(null);
  }, [snapshot]);

  const relayout = useCallback((name) => {
    setLayout(name);
    snapshot();
    setNodes((nds) => applyLayout(name, nds, edgesRef.current, { rootId: selectedId }));
    setTimeout(() => rf.fitView({ padding: FIT_PAD(), duration: 500 }), 90);
  }, [rf, selectedId, snapshot]);

  const focusNode = useCallback((id) => {
    setFocusId(id); setSelectedId(id);
    rf.fitView({ nodes: [{ id }], padding: 1.4, duration: 450, maxZoom: 1.4 });
  }, [rf]);

  // ── Raccourcis clavier ──────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) { e.preventDefault(); redo(); }
      else if (e.key === 'Delete' || e.key === 'Backspace') { deleteSelected(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo, deleteSelected]);

  // ── Export ──────────────────────────────────────────────
  const exportJSON = useCallback(() => {
    const data = { nodes: nodesRef.current.map(stripNode), edges: edgesRef.current.map(stripEdge), meta: { exportedAt: new Date().toISOString() } };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'analytic-mind.json'; a.click();
    URL.revokeObjectURL(url);
  }, []);

  const exportPNG = useCallback(() => {
    const W = 1600, H = 1000;
    const bounds = getNodesBounds(nodesRef.current);
    const vp = getViewportForBounds(bounds, W, H, 0.4, 2.5, 0.12);
    const el = document.querySelector('.react-flow__viewport');
    if (!el) return;
    toPng(el, {
      backgroundColor: '#0f1117', width: W, height: H,
      style: { width: `${W}px`, height: `${H}px`, transform: `translate(${vp.x}px,${vp.y}px) scale(${vp.zoom})` },
    }).then((dataUrl) => {
      const a = document.createElement('a');
      a.href = dataUrl; a.download = 'analytic-mind.png'; a.click();
    }).catch(() => { /* export best-effort */ });
  }, []);

  const loadExample = useCallback(() => {
    snapshot();
    setNodes(applyLayout('hierarchical', clone(EXAMPLE_NODES), EXAMPLE_EDGES));
    setEdges(clone(EXAMPLE_EDGES));
    setLayout('hierarchical');
    setTimeout(() => rf.fitView({ padding: FIT_PAD(), duration: 500 }), 90);
  }, [rf, snapshot]);

  const clearAll = useCallback(() => { snapshot(); setNodes([]); setEdges([]); setFocusId(null); }, [snapshot]);

  const toggleType = (t) => setActiveTypes((s) => {
    const n = new Set(s);
    if (n.has(t)) n.delete(t); else n.add(t);
    return n;
  });

  const isEmpty = nodes.length === 0;

  return (
    <GraphActions.Provider value={{ commitLabel }}>
      <div style={{ width: '100vw', height: '100vh', background: 'var(--ink-850)', position: 'relative' }}>
        <ReactFlow
          nodes={displayNodes}
          edges={displayEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeDragStart={onNodeDragStart}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: FIT_PAD() }}
          minZoom={0.15}
          maxZoom={2.5}
          proOptions={{ hideAttribution: true }}
          colorMode="dark"
          deleteKeyCode={null}
        >
          <Background color="#1c2230" gap={22} size={1} />
          <Controls showInteractive={false} position="bottom-left" />
          <MiniMap
            pannable zoomable
            nodeColor={(n) => (NODE_TYPES[n.data?.type]?.accent) || '#8b93a7'}
            nodeStrokeWidth={0}
            maskColor="rgba(11,13,19,0.7)"
            style={{ background: 'var(--ink-800)', border: '1px solid var(--ink-700)' }}
          />

          <Panel position="top-left">
            <Toolbar
              open={toolOpen} onToggle={() => setToolOpen((o) => !o)}
              layout={layout} onLayout={relayout}
              relType={relType} setRelType={setRelType}
              addType={addType} setAddType={setAddType}
              onAdd={addNode}
              onUndo={undo} onRedo={redo}
              canUndo={past.current.length > 0} canRedo={future.current.length > 0}
              onDelete={deleteSelected}
              onExportJSON={exportJSON} onExportPNG={exportPNG}
              onClear={clearAll}
              search={search} setSearch={setSearch}
              activeTypes={activeTypes} toggleType={toggleType}
            />
          </Panel>
        </ReactFlow>

        {!isEmpty && (
          <AnalyticsPanel
            analysis={analysis}
            collapsed={panelCollapsed}
            onToggle={() => setPanelCollapsed((c) => !c)}
            onFocusNode={focusNode}
            selectedId={selectedId}
          />
        )}

        {isEmpty && <Onboarding onLoad={loadExample} onAdd={() => addNode('question')} />}
      </div>
    </GraphActions.Provider>
  );
}

// ── Barre d'outils ────────────────────────────────────────
function Toolbar(props) {
  const {
    open, onToggle,
    layout, onLayout, relType, setRelType, addType, setAddType, onAdd,
    onUndo, onRedo, canUndo, canRedo, onDelete, onExportJSON, onExportPNG,
    onClear, search, setSearch, activeTypes, toggleType,
  } = props;

  return (
    <div className="surface" style={{ padding: 11, width: open ? 264 : 'auto', display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 'calc(100vh - 28px)', overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 9, height: 9, borderRadius: 3, background: 'var(--accent)', boxShadow: '0 0 10px var(--accent)', flex: 'none' }} />
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14, color: 'var(--grey-100)', letterSpacing: '-0.01em' }}>
            Analytic Mind
          </div>
          {open && <div className="mono" style={{ fontSize: 9, color: 'var(--grey-500)' }}>atelier de pensée auto-analysé</div>}
        </div>
        <button className="btn" onClick={onToggle} title={open ? 'Replier' : 'Déplier'}
          style={{ marginLeft: 'auto', padding: '3px 9px', fontSize: 13 }}>
          {open ? '▾' : '▸'}
        </button>
      </div>

      {!open && <div style={{ display: 'flex', gap: 5 }}>
        {LAYOUTS.map((l) => (
          <button key={l.id} className={`btn ${layout === l.id ? 'active' : ''}`} onClick={() => onLayout(l.id)}
            style={{ padding: '5px 8px', fontSize: 11 }}>{l.label}</button>
        ))}
      </div>}

      {open && <>
      <input className="input" placeholder="Rechercher un nœud…" value={search} onChange={(e) => setSearch(e.target.value)} />

      <div>
        <div className="section-title">Filtrer par type</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          {Object.entries(NODE_TYPES).map(([key, t]) => {
            const on = activeTypes.has(key);
            return (
              <span key={key} className={`chip ${on ? 'on' : ''}`}
                onClick={() => toggleType(key)}
                style={on ? { background: t.accent, borderColor: t.accent } : { color: t.accent }}>
                <span style={{ opacity: 0.9 }}>{t.glyph}</span>{t.label}
              </span>
            );
          })}
        </div>
      </div>

      <div>
        <div className="section-title">Disposition</div>
        <div style={{ display: 'flex', gap: 5 }}>
          {LAYOUTS.map((l) => (
            <button key={l.id} className={`btn ${layout === l.id ? 'active' : ''}`}
              onClick={() => onLayout(l.id)} title={l.hint}
              style={{ flex: 1, justifyContent: 'center', padding: '6px 4px', fontSize: 11 }}>
              {l.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="section-title">Ajouter un nœud</div>
        <div style={{ display: 'flex', gap: 5 }}>
          <select className="input" value={addType} onChange={(e) => setAddType(e.target.value)} style={{ flex: 1, padding: '6px 8px', cursor: 'pointer' }}>
            {Object.entries(NODE_TYPES).map(([k, t]) => <option key={k} value={k}>{t.label}</option>)}
          </select>
          <button className="btn accent" onClick={() => onAdd(addType)} style={{ padding: '6px 12px' }}>+ Créer</button>
        </div>
      </div>

      <div>
        <div className="section-title">Lien tracé (glisser entre nœuds)</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          {Object.entries(EDGE_TYPES).map(([key, t]) => (
            <span key={key} className="chip"
              onClick={() => setRelType(key)}
              style={relType === key
                ? { borderColor: t.color, color: t.color, background: `${t.color}18` }
                : { color: 'var(--grey-400)' }}>
              <span style={{ width: 14, height: 0, borderTop: `2px ${t.dash ? 'dashed' : 'solid'} ${t.color}` }} />
              {t.label}
            </span>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
        <button className="btn" onClick={onUndo} disabled={!canUndo} title="Ctrl+Z" style={{ flex: 1, justifyContent: 'center' }}>↶ Annuler</button>
        <button className="btn" onClick={onRedo} disabled={!canRedo} title="Ctrl+Y" style={{ flex: 1, justifyContent: 'center' }}>↷ Rétablir</button>
      </div>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
        <button className="btn" onClick={onDelete} title="Suppr" style={{ flex: 1, justifyContent: 'center' }}>Supprimer</button>
        <button className="btn" onClick={onExportJSON} style={{ flex: 1, justifyContent: 'center' }}>JSON</button>
        <button className="btn" onClick={onExportPNG} style={{ flex: 1, justifyContent: 'center' }}>PNG</button>
      </div>
      <button className="btn" onClick={onClear} style={{ justifyContent: 'center', fontSize: 11, color: 'var(--grey-500)' }}>Vider le canvas</button>
      </>}
    </div>
  );
}

// ── Onboarding (canvas vide) ──────────────────────────────
function Onboarding({ onLoad, onAdd }) {
  return (
    <div style={{
      position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
      zIndex: 5, pointerEvents: 'none',
    }}>
      <div className="surface" style={{ padding: '30px 34px', maxWidth: 440, textAlign: 'center', pointerEvents: 'auto' }}>
        <div className="mono" style={{ fontSize: 10, color: 'var(--accent)', letterSpacing: '0.16em', marginBottom: 10 }}>
          ATELIER DE PENSÉE
        </div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 700, color: 'var(--grey-100)', lineHeight: 1.15, marginBottom: 10 }}>
          Une carte qui s'analyse<br />elle-même.
        </h1>
        <p style={{ fontSize: 13, color: 'var(--grey-400)', lineHeight: 1.5, marginBottom: 20 }}>
          Posez des concepts, questions, preuves et risques ; reliez-les par des liens
          typés. À chaque geste, le panneau mesure centralité, clusters et chemin critique.
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
          <button className="btn accent" onClick={onLoad} style={{ padding: '9px 16px' }}>Charger l'exemple</button>
          <button className="btn" onClick={onAdd} style={{ padding: '9px 16px' }}>Partir d'une question</button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ReactFlowProvider>
      <Workshop />
    </ReactFlowProvider>
  );
}
