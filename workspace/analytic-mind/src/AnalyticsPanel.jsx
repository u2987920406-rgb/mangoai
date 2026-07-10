// AnalyticsPanel.jsx — le cœur de l'app.
// Recalcule et affiche, en temps réel, les métriques structurelles du graphe.
// Dense, tabular-nums, repliable, ne masque pas le canvas.
import { NODE_TYPES } from './example-data';

function Meter({ value }) {
  return (
    <div className="bar" style={{ width: 54, flex: 'none' }}>
      <span style={{ width: `${Math.round(value * 100)}%` }} />
    </div>
  );
}

export default function AnalyticsPanel({ analysis, collapsed, onToggle, onFocusNode, selectedId }) {
  const a = analysis;
  const {
    nodeCount, edgeCount, density, clusters, critical, orphans,
    ranked, topInfluential, degrees, betweenness,
  } = a;

  const avgDeg = nodeCount ? (edgeCount * 2) / nodeCount : 0;
  const biggestCluster = clusters.sizes.size ? Math.max(...clusters.sizes.values()) : 0;
  const typeCounts = { concept: 0, question: 0, preuve: 0, risque: 0 };
  for (const r of ranked) {
    const t = a.nodeTypeById?.get(r.id);
    if (t && typeCounts[t] !== undefined) typeCounts[t] += 1;
  }

  if (collapsed) {
    return (
      <button className="btn" onClick={onToggle} style={{ position: 'absolute', top: 14, right: 14, zIndex: 20 }}>
        ▤ Analyse
      </button>
    );
  }

  return (
    <div
      className="surface"
      style={{
        position: 'absolute', top: 14, right: 14, zIndex: 20,
        width: 288, maxHeight: 'calc(100% - 28px)',
        display: 'flex', flexDirection: 'column',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 13px 9px', borderBottom: '1px solid var(--ink-700)' }}>
        <span style={{ width: 7, height: 7, borderRadius: 99, background: 'var(--accent)', boxShadow: '0 0 8px var(--accent)' }} />
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 13, color: 'var(--grey-100)' }}>
          Analyse structurelle
        </span>
        <button className="btn" onClick={onToggle} style={{ marginLeft: 'auto', padding: '3px 8px', fontSize: 11 }}>
          ✕
        </button>
      </div>

      <div style={{ overflowY: 'auto', padding: '11px 13px 14px' }}>
        {/* Vue d'ensemble */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 14px', marginBottom: 14 }}>
          <Stat k="Nœuds" v={nodeCount} />
          <Stat k="Liens" v={edgeCount} />
          <Stat k="Densité" v={density.toFixed(3)} sub="dirigée" />
          <Stat k="Degré moy." v={avgDeg.toFixed(2)} />
        </div>

        {/* Clusters */}
        <div className="section-title">Clusters · union-find</div>
        <div className="metric-row" style={{ paddingTop: 2 }}>
          <span className="metric-k">Composantes connexes</span>
          <span className="metric-v">{clusters.count}</span>
        </div>
        <div className="metric-row">
          <span className="metric-k">Plus grand cluster</span>
          <span className="metric-v">{biggestCluster}<span className="metric-sub"> nœuds</span></span>
        </div>

        {/* Chemin critique */}
        <div className="section-title" style={{ marginTop: 14 }}>Chemin critique · profondeur</div>
        <div className="metric-row" style={{ paddingTop: 2 }}>
          <span className="metric-k">Profondeur max</span>
          <span className="metric-v">{critical.depth}<span className="metric-sub"> arêtes</span></span>
        </div>
        <div className="metric-row">
          <span className="metric-k">Longueur du chemin</span>
          <span className="metric-v">{critical.length}<span className="metric-sub"> nœuds</span></span>
        </div>
        {critical.hasCycle && (
          <div className="metric-sub" style={{ color: 'var(--t-risque)', marginTop: 2 }}>⚠ cycle détecté — DAG partiel</div>
        )}
        {critical.path.length > 1 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
            {critical.path.map((id, i) => (
              <span key={id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <button
                  onClick={() => onFocusNode(id)}
                  className="chip"
                  style={{ borderColor: 'var(--accent-dim)', color: 'var(--accent)' }}
                  title="Focaliser"
                >
                  {a.labelById?.get(id) ? truncate(a.labelById.get(id), 13) : id}
                </button>
                {i < critical.path.length - 1 && <span style={{ color: 'var(--grey-500)', fontSize: 10 }}>→</span>}
              </span>
            ))}
          </div>
        )}

        {/* Orphelins */}
        <div className="section-title" style={{ marginTop: 14 }}>Nœuds orphelins</div>
        {orphans.length === 0 ? (
          <div className="metric-sub" style={{ color: 'var(--t-preuve)' }}>Aucun — graphe entièrement relié ✓</div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 2 }}>
            {orphans.map((id) => (
              <button key={id} className="chip" onClick={() => onFocusNode(id)}
                style={{ borderColor: 'var(--t-risque)', color: 'var(--t-risque)' }}>
                {a.labelById?.get(id) ? truncate(a.labelById.get(id), 16) : id}
              </button>
            ))}
          </div>
        )}

        {/* Top influents — betweenness de Brandes */}
        <div className="section-title" style={{ marginTop: 14 }}>Nœuds influents · Brandes betweenness</div>
        {ranked.slice(0, 6).map((r) => {
          const t = a.nodeTypeById?.get(r.id);
          const acc = t ? NODE_TYPES[t].accent : 'var(--accent)';
          const bw = betweenness.get(r.id) || 0;
          const isTop = topInfluential.some((x) => x.id === r.id);
          return (
            <button
              key={r.id}
              onClick={() => onFocusNode(r.id)}
              className={`rank-row ${selectedId === r.id ? 'selected' : ''}`}
            >
              <span style={{ width: 6, height: 6, borderRadius: 99, background: acc, flex: 'none' }} />
              <span style={{ fontSize: 11.5, color: 'var(--grey-100)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {isTop && <span style={{ color: 'var(--accent)' }}>★ </span>}
                {a.labelById?.get(r.id) || r.id}
              </span>
              <Meter value={r.score} />
              <span className="mono" style={{ fontSize: 10, color: 'var(--grey-400)', width: 32, textAlign: 'right', flex: 'none' }}>
                {bw.toFixed(2)}
              </span>
            </button>
          );
        })}
        <div className="metric-sub" style={{ marginTop: 6, lineHeight: 1.4, color: 'var(--grey-500)' }}>
          Score influence = 0.6·betweenness + 0.4·degré. Recalculé à chaque édition.
        </div>
      </div>
    </div>
  );
}

function Stat({ k, v, sub }) {
  return (
    <div>
      <div className="metric-k" style={{ fontSize: 10 }}>{k}</div>
      <div className="metric-v" style={{ fontSize: 18, lineHeight: 1.1 }}>
        {v}{sub && <span className="metric-sub" style={{ fontSize: 9, marginLeft: 3 }}>{sub}</span>}
      </div>
    </div>
  );
}

function truncate(s, n) {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}
