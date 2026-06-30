// ─── Mascotte TOEIC QUEST — Mango le personnage ──────────────────────────────
// Un petit personnage mangue stylisé en SVG qui réagit selon l'humeur.

export function Mascot({ mood = "happy", size = 120, className = "" }) {
  const eyeY = mood === "happy" ? 58 : mood === "sad" ? 62 : 58;
  const mouthPath = {
    happy: "M 55 78 Q 70 92 85 78",
    excited: "M 52 76 Q 70 100 88 76",
    sad: "M 55 88 Q 70 74 85 88",
    thinking: "M 58 82 L 82 82",
    celebrating: "M 50 74 Q 70 105 90 74",
  };

  const cheekOpacity = mood === "happy" || mood === "excited" || mood === "celebrating" ? 0.5 : 0;
  const bounceClass = mood === "excited" || mood === "celebrating" ? "animate-bounce-in" : "";

  return (
    <div className={`inline-block ${bounceClass} ${className}`} style={{ width: size, height: size }}>
      <svg viewBox="0 0 140 140" width={size} height={size} fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Leaf on top */}
        <path d="M 70 18 Q 60 5 50 8 Q 55 18 62 22 Q 55 12 70 18 Q 85 12 78 22 Q 85 18 90 8 Q 80 5 70 18" fill="#4ade80" />
        <path d="M 70 18 L 70 28" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" />

        {/* Body — mango shape */}
        <ellipse cx="70" cy="78" rx="48" ry="52" fill="#F2A33C" />
        <ellipse cx="70" cy="78" rx="48" ry="52" fill="url(#mangoGradient)" />
        {/* Highlight */}
        <ellipse cx="52" cy="58" rx="14" ry="20" fill="#fff" opacity="0.25" />

        {/* Cheeks */}
        <circle cx="42" cy="78" r="7" fill="#E8624A" opacity={cheekOpacity} />
        <circle cx="98" cy="78" r="7" fill="#E8624A" opacity={cheekOpacity} />

        {/* Eyes */}
        {mood === "thinking" ? (
          <>
            <line x1="50" y1={eyeY} x2="62" y2={eyeY} stroke="#3c3c3c" strokeWidth="3" strokeLinecap="round" />
            <line x1="78" y1={eyeY} x2="90" y2={eyeY} stroke="#3c3c3c" strokeWidth="3" strokeLinecap="round" />
          </>
        ) : mood === "sad" ? (
          <>
            <path d={`M 50 ${eyeY + 4} Q 56 ${eyeY - 2} 62 ${eyeY + 4}`} stroke="#3c3c3c" strokeWidth="3" fill="none" strokeLinecap="round" />
            <path d={`M 78 ${eyeY + 4} Q 84 ${eyeY - 2} 90 ${eyeY + 4}`} stroke="#3c3c3c" strokeWidth="3" fill="none" strokeLinecap="round" />
          </>
        ) : (
          <>
            <circle cx="56" cy={eyeY} r="5" fill="#3c3c3c" />
            <circle cx="84" cy={eyeY} r="5" fill="#3c3c3c" />
            <circle cx="58" cy={eyeY - 2} r="1.5" fill="#fff" />
            <circle cx="86" cy={eyeY - 2} r="1.5" fill="#fff" />
          </>
        )}

        {/* Mouth */}
        <path d={mouthPath[mood] || mouthPath.happy} stroke="#3c3c3c" strokeWidth="3" fill="none" strokeLinecap="round" />

        {/* Arms for celebrating */}
        {(mood === "celebrating" || mood === "excited") && (
          <>
            <path d="M 22 70 Q 15 55 18 45" stroke="#F2A33C" strokeWidth="6" fill="none" strokeLinecap="round" />
            <path d="M 118 70 Q 125 55 122 45" stroke="#F2A33C" strokeWidth="6" fill="none" strokeLinecap="round" />
          </>
        )}

        <defs>
          <linearGradient id="mangoGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#F8B850" />
            <stop offset="100%" stopColor="#E89530" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}

// ─── Message de la mascotte ──────────────────────────────────────────────────
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