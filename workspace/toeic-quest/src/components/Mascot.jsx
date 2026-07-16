// ─── Badge d'ambiance — orbe glossy dégradé corail/ambre ─────────────────────
// Remplace l'ancienne mascotte-mangue : un repère visuel léger et cohérent avec
// l'identité "Yes I Can Toeic" (cartes blanches, halo diffus, orbes glossy),
// sans personnage anthropomorphe. Même signature (mood/size/className) que
// l'ancien composant pour ne rien casser dans les 8 sites d'appel existants.

const MOOD_GLYPH = {
  happy: "M 34 52 L 46 64 L 70 38",
  excited: "M 34 52 L 46 64 L 70 38",
  sad: "M 36 40 v 24 M 64 40 v 24",
  thinking: "M 36 52 h 12 M 52 52 h 12 M 68 52 h 8",
  celebrating: "M 52 30 L 58 46 L 75 46 L 61 56 L 66 73 L 52 62 L 38 73 L 43 56 L 29 46 L 46 46 Z",
};

const MOOD_GRADIENT = {
  happy: ["#ff8a6e", "#ff6f57"],
  excited: ["#ffb648", "#ff8a6e"],
  sad: ["#c7bfc9", "#a89fb0"],
  thinking: ["#9a8cf2", "#7c6ce0"],
  celebrating: ["#ffb648", "#ff6f57"],
};

export function Mascot({ mood = "happy", size = 120, className = "" }) {
  const [from, to] = MOOD_GRADIENT[mood] || MOOD_GRADIENT.happy;
  const glyph = MOOD_GLYPH[mood] || MOOD_GLYPH.happy;
  const gradientId = `orbGradient-${mood}`;
  const bounceClass = mood === "excited" || mood === "celebrating" ? "animate-bounce-in" : "";

  return (
    <div className={`inline-block ${bounceClass} ${className}`} style={{ width: size, height: size }}>
      <svg viewBox="0 0 104 104" width={size} height={size} fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={from} />
            <stop offset="100%" stopColor={to} />
          </linearGradient>
        </defs>
        <circle cx="52" cy="52" r="48" fill={`url(#${gradientId})`} />
        <ellipse cx="38" cy="34" rx="16" ry="10" fill="#fff" opacity="0.28" />
        {mood === "celebrating" ? (
          <path d={glyph} fill="#fff" opacity="0.95" />
        ) : (
          <path d={glyph} stroke="#fff" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.95" />
        )}
      </svg>
    </div>
  );
}

// ─── Message avec le badge d'ambiance ─────────────────────────────────────────
export function MascotMessage({ mood, message, size = 100 }) {
  return (
    <div className="flex items-end gap-3">
      <Mascot mood={mood} size={size} />
      <div className="relative rounded-2xl bg-card border border-border px-4 py-3 shadow-sm max-w-xs">
        <div className="absolute left-[-8px] bottom-4 w-4 h-4 bg-card border-l border-b border-border rotate-45" />
        <p className="text-sm text-foreground relative z-10">{message}</p>
      </div>
    </div>
  );
}
