// Bloc de section réutilisable du panneau Knowledge (titre + icône + action).
// Présentationnel pur — extrait verbatim de Knowledge.jsx.
export default function Section({ icon: Icon, title, children, action = null, badge = null }) {
  return (
    <section className="rounded-lg px-2 py-2">
      <h3 className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-faint">
        <Icon size={12} />
        {title}
        {badge}
        {action && <span className="ml-auto">{action}</span>}
      </h3>
      {children}
    </section>
  );
}
