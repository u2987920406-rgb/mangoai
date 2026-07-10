// AnalyticNode.jsx — nœud typé (concept / question / preuve / risque)
// Couleur sémantique par type · badge influent ★ · centralité affichée ·
// édition inline du label (double-clic).
import { memo, useContext, useEffect, useRef, useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import { NODE_TYPES } from './example-data';
import { GraphActions } from './graph-actions';

function AnalyticNode({ id, data, selected }) {
  const actions = useContext(GraphActions);
  const t = NODE_TYPES[data.type] || NODE_TYPES.concept;
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(data.label);
  const ref = useRef(null);

  useEffect(() => { setVal(data.label); }, [data.label]);
  useEffect(() => { if (editing && ref.current) { ref.current.focus(); ref.current.select(); } }, [editing]);

  function commit() {
    setEditing(false);
    if (val.trim() && val !== data.label) actions.commitLabel(id, val.trim());
    else setVal(data.label);
  }

  const cls = ['anode'];
  if (selected) cls.push('selected');
  if (data.__dimmed) cls.push('dimmed');
  if (data.__influential) cls.push('influential');

  return (
    <div className={cls.join(' ')} style={{ '--node-accent': t.accent }} onDoubleClick={() => setEditing(true)}>
      <Handle type="target" position={Position.Top} />
      <div className="anode__head">
        <span className="anode__glyph">{t.glyph}</span>
        <span className="anode__type">{t.label}</span>
        {data.__centrality != null && (
          <span className="anode__cent" title="Betweenness (Brandes)">
            c {data.__centrality.toFixed(2)}
          </span>
        )}
      </div>
      {editing ? (
        <input
          ref={ref}
          className="anode__label-input"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') { setVal(data.label); setEditing(false); }
          }}
        />
      ) : (
        <div className="anode__label">{data.label}</div>
      )}
      {data.desc && !editing && <div className="anode__desc">{data.desc}</div>}
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

export default memo(AnalyticNode);
