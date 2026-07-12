// Jauge de fenêtre de contexte — indicateur graduel (barre colorée) + pourcentage.
// Extrait de Header.jsx (2026-07-13) pour être réutilisable par l'Accueil (Home.jsx),
// qui n'a pas de Header. Alimentée par Claude (contextTokens/contextWindow natifs du
// SDK) ET par l'Élève (estimation heuristique, chat-route.ts::sendEleveContext /
// home-routes.ts) — la fenêtre de contexte est une contrainte PHYSIQUE du modèle
// (num_ctx Ollama), pas une question de coût : elle compte même à $0.
export default function ContextGauge({ tokens, window: win }) {
  const pct = Math.min(100, Math.round((tokens / win) * 100));
  const color = pct >= 70 ? "bg-err" : pct >= 50 ? "bg-warn" : "bg-ok";
  return (
    <span
      className="flex items-center gap-1.5 font-mono text-xs text-faint"
      title={`Contexte : ${Math.round(tokens / 1000)}k / ${Math.round(win / 1000)}k tokens — compression auto au-delà de 70 %`}
    >
      <span className="h-1.5 w-12 overflow-hidden rounded-full bg-edge-soft">
        <span className={`block h-full ${color}`} style={{ width: `${pct}%` }} />
      </span>
      {pct}%
    </span>
  );
}
