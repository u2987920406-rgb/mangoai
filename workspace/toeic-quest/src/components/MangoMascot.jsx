// ── Mango Mascot — SVG character with moods ──────────────────────────────────
// A cute mango character that reacts to user performance

const MANGO_COLOR = "#F2A33C";
const MANGO_DARK = "#D4881E";
const LEAF_COLOR = "#58cc02";
const LEAF_DARK = "#3da101";

export function MangoMascot({ mood = "happy", size = 120, className = "" }) {
  // Moods: happy, encouraging, celebrating, sad, thinking
  const eyeShapes = {
    happy: (
      <>
        <circle cx="42" cy="48" r="5" fill="#3c3c3c" />
        <circle cx="78" cy="48" r="5" fill="#3c3c3c" />
        <circle cx="44" cy="46" r="1.5" fill="#fff" />
        <circle cx="80" cy="46" r="1.5" fill="#fff" />
      </>
    ),
    encouraging: (
      <>
        <path d="M37 48 Q42 43, 47 48" stroke="#3c3c3c" strokeWidth="3" fill="none" strokeLinecap="round" />
        <path d="M73 48 Q78 43, 83 48" stroke="#3c3c3c" strokeWidth="3" fill="none" strokeLinecap="round" />
      </>
    ),
    celebrating: (
      <>
        <path d="M37 50 Q42 40, 47 50" stroke="#3c3c3c" strokeWidth="3" fill="none" strokeLinecap="round" />
        <path d="M73 50 Q78 40, 83 50" stroke="#3c3c3c" strokeWidth="3" fill="none" strokeLinecap="round" />
        <circle cx="35" cy="35" r="3" fill="#FFD700" className="animate-pop" />
        <circle cx="85" cy="35" r="3" fill="#FFD700" className="animate-pop" />
      </>
    ),
    sad: (
      <>
        <circle cx="42" cy="50" r="4" fill="#3c3c3c" />
        <circle cx="78" cy="50" r="4" fill="#3c3c3c" />
        <path d="M37 42 L47 42" stroke="#3c3c3c" strokeWidth="2" strokeLinecap="round" />
        <path d="M73 42 L83 42" stroke="#3c3c3c" strokeWidth="2" strokeLinecap="round" />
      </>
    ),
    thinking: (
      <>
        <circle cx="42" cy="48" r="4" fill="#3c3c3c" />
        <circle cx="78" cy="46" r="4" fill="#3c3c3c" />
        <path d="M37 40 L47 42" stroke="#3c3c3c" strokeWidth="2" strokeLinecap="round" />
      </>
    ),
  };

  const mouthShapes = {
    happy: <path d="M48 62 Q60 72, 72 62" stroke="#3c3c3c" strokeWidth="3" fill="none" strokeLinecap="round" />,
    encouraging: <path d="M50 64 Q60 70, 70 64" stroke="#3c3c3c" strokeWidth="3" fill="none" strokeLinecap="round" />,
    celebrating: <path d="M46 60 Q60 78, 74 60 Q60 68, 46 60" fill="#3c3c3c" />,
    sad: <path d="M50 68 Q60 62, 70 68" stroke="#3c3c3c" strokeWidth="3" fill="none" strokeLinecap="round" />,
    thinking: <path d="M52 64 Q60 66, 68 64" stroke="#3c3c3c" strokeWidth="2.5" fill="none" strokeLinecap="round" />,
  };

  const cheeks = (mood === "happy" || mood === "celebrating" || mood === "encouraging") && (
    <>
      <circle cx="32" cy="58" r="6" fill="#E8624A" opacity="0.3" />
      <circle cx="88" cy="58" r="6" fill="#E8624A" opacity="0.3" />
    </>
  );

  return (
    <div className={`inline-block ${className}`} style={{ width: size, height: size }}>
      <svg viewBox="0 0 120 120" width={size} height={size} className={mood === "celebrating" ? "animate-bounce-in" : mood === "sad" ? "" : "animate-float"}>
        {/* Shadow */}
        <ellipse cx="60" cy="112" rx="30" ry="4" fill="#000" opacity="0.1" />

        {/* Leaf */}
        <path d="M55 18 Q50 5, 65 8 Q72 12, 68 22 Q62 20, 55 18" fill={LEAF_COLOR} />
        <path d="M60 15 Q58 8, 64 10" stroke={LEAF_DARK} strokeWidth="1.5" fill="none" />

        {/* Mango body */}
        <ellipse cx="60" cy="65" rx="38" ry="42" fill={MANGO_COLOR} />
        <ellipse cx="50" cy="50" rx="12" ry="14" fill="#FFD08A" opacity="0.5" />

        {/* Eyes */}
        {eyeShapes[mood] || eyeShapes.happy}

        {/* Cheeks */}
        {cheeks}

        {/* Mouth */}
        {mouthShapes[mood] || mouthShapes.happy}

        {/* Arms (only for celebrating) */}
        {mood === "celebrating" && (
          <>
            <path d="M22 55 Q12 40, 18 30" stroke={MANGO_DARK} strokeWidth="4" fill="none" strokeLinecap="round" />
            <path d="M98 55 Q108 40, 102 30" stroke={MANGO_DARK} strokeWidth="4" fill="none" strokeLinecap="round" />
          </>
        )}
      </svg>
    </div>
  );
}

// ── Mascot with speech bubble ─────────────────────────────────────────────────
export function MangoMascotBubble({ mood = "happy", message = "", size = 100, className = "" }) {
  return (
    <div className={`flex items-start gap-3 ${className}`}>
      <MangoMascot mood={mood} size={size} />
      {message && (
        <div className="relative mt-2 rounded-2xl bg-card border border-border px-4 py-3 shadow-sm animate-fade-in-up">
          <div className="absolute -left-2 top-4 w-0 h-0 border-t-[8px] border-t-transparent border-r-[10px] border-r-card border-b-[8px] border-b-transparent" />
          <p className="text-sm font-medium text-foreground">{message}</p>
        </div>
      )}
    </div>
  );
}