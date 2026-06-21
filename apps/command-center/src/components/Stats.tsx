import type { Idea, ModelTier } from '../types'
import { EFFORTS, EFFORT_WEIGHT, MODEL_META, STATUSES, STATUS_META } from '../types'

interface Props {
  ideas: Idea[] // toutes (non filtrees) pour des stats globales
}

const MODELS: ModelTier[] = ['opus', 'sonnet', 'haiku', 'none']

export default function Stats({ ideas }: Props) {
  const total = ideas.length
  const done = ideas.filter((i) => i.status === 'done').length
  const pct = total ? Math.round((done / total) * 100) : 0

  const byStatus = STATUSES.map((s) => ({
    s,
    n: ideas.filter((i) => i.status === s).length,
  }))

  const byModel = MODELS.map((m) => ({
    m,
    n: ideas.filter((i) => i.model === m).length,
  })).filter((x) => x.n > 0)

  const effortHist = EFFORTS.filter((e) => e !== 'none').map((e) => ({
    e,
    n: ideas.filter((i) => i.effort === e).length,
  }))
  const maxEffort = Math.max(1, ...effortHist.map((x) => x.n))
  const totalEffort = ideas.reduce((s, i) => s + EFFORT_WEIGHT[i.effort], 0)

  return (
    <section className="stats glass">
      <div className="stats-grid">
        <div className="stat-block">
          <div className="stat-big">{total}</div>
          <div className="stat-cap">cartes</div>
        </div>

        <div className="stat-block stat-progress">
          <div className="progress-head">
            <span>Avancement</span>
            <strong>{pct}%</strong>
          </div>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${pct}%` }} />
          </div>
          <div className="stat-cap">
            {done} fait{done > 1 ? 's' : ''} sur {total}
          </div>
        </div>

        <div className="stat-block">
          <div className="pill-row">
            {byStatus.map(({ s, n }) => (
              <span key={s} className={`pill pill-${s}`} title={STATUS_META[s].label}>
                <span aria-hidden>{STATUS_META[s].emoji}</span> {n}
              </span>
            ))}
          </div>
          <div className="stat-cap">par colonne</div>
        </div>

        <div className="stat-block">
          <div className="pill-row">
            {byModel.map(({ m, n }) => (
              <span key={m} className={`pill model-pill model-${m}`} title={MODEL_META[m].label}>
                <span aria-hidden>{MODEL_META[m].emoji}</span> {n}
              </span>
            ))}
          </div>
          <div className="stat-cap">par modele</div>
        </div>

        <div className="stat-block stat-hist">
          <div className="hist">
            {effortHist.map(({ e, n }) => (
              <div key={e} className="hist-col" title={`${n} carte(s) en ${e}`}>
                <div className="hist-bar-wrap">
                  <div
                    className={`hist-bar effort-chip-${e}`}
                    style={{ height: `${(n / maxEffort) * 100}%` }}
                  />
                </div>
                <span className="hist-label">{e}</span>
                <span className="hist-n">{n}</span>
              </div>
            ))}
          </div>
          <div className="stat-cap">effort · Σ{totalEffort} pts</div>
        </div>
      </div>
    </section>
  )
}
