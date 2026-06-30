import { useMemo, useCallback } from "react";

// ── DepthBackground : fond qui passe du bleu de surface au noir abyssal ─
export function DepthBackground({ scrollProgress }) {
  const bgStyle = useMemo(() => {
    // Interpolation de couleur du bleu surface → noir abyssal
    // 0% = #0a4a7a (bleu surface), 100% = #000206 (noir abyssal)
    const p = scrollProgress;
    // Trois étapes : surface (bleu) → mi-profondeur (bleu nuit) → abyssal (noir)
    const colors = [
      { stop: 0, r: 10, g: 74, b: 122 },    // #0a4a7a
      { stop: 0.25, r: 6, g: 42, b: 74 },   // #062a4a
      { stop: 0.5, r: 3, g: 21, b: 40 },    // #031528
      { stop: 0.75, r: 1, g: 8, b: 18 },    // #010812
      { stop: 1, r: 0, g: 2, b: 6 },        // #000206
    ];

    let r, g, b;
    for (let i = 0; i < colors.length - 1; i++) {
      if (p <= colors[i + 1].stop) {
        const localP = (p - colors[i].stop) / (colors[i + 1].stop - colors[i].stop);
        r = Math.round(colors[i].r + (colors[i + 1].r - colors[i].r) * localP);
        g = Math.round(colors[i].g + (colors[i + 1].g - colors[i].g) * localP);
        b = Math.round(colors[i].b + (colors[i + 1].b - colors[i].b) * localP);
        break;
      }
    }
    // Fallback
    if (r === undefined) {
      const last = colors[colors.length - 1];
      r = last.r; g = last.g; b = last.b;
    }

    return {
      backgroundColor: `rgb(${r}, ${g}, ${b})`,
    };
  }, [scrollProgress]);

  return (
    <div
      className="fixed inset-0 z-0 transition-[background-color] duration-300"
      style={bgStyle}
      aria-hidden="true"
    />
  );
}

// ── Bioluminescence : particules qui s'allument dans l'obscurité ─
export function Bioluminescence({ scrollProgress }) {
  const particles = useMemo(() => {
    const arr = [];
    const count = 40;
    for (let i = 0; i < count; i++) {
      arr.push({
        id: i,
        left: Math.random() * 100,
        top: Math.random() * 100,
        size: Math.random() * 4 + 1,
        delay: Math.random() * 8,
        duration: Math.random() * 6 + 4,
        color: ["#00e5ff", "#4dff9f", "#ff6b6b"][Math.floor(Math.random() * 3)],
        opacity: Math.random() * 0.5 + 0.3,
      });
    }
    return arr;
  }, []);

  // Les particules deviennent plus visibles à mesure qu'on descend
  const visibility = Math.min(scrollProgress * 1.5, 1);

  return (
    <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden" aria-hidden="true">
      {particles.map((p) => (
        <div
          key={p.id}
          className="bio-particle"
          style={{
            left: `${p.left}%`,
            top: `${p.top}%`,
            width: `${p.size}px`,
            height: `${p.size}px`,
            backgroundColor: p.color,
            boxShadow: `0 0 ${p.size * 4}px ${p.color}, 0 0 ${p.size * 8}px ${p.color}`,
            opacity: p.opacity * visibility,
            animation: `abyss-pulse ${p.duration}s ease-in-out ${p.delay}s infinite`,
          }}
        />
      ))}
    </div>
  );
}

// ── DepthIndicator : indicateur de profondeur (mètres) fixe sur le côté ─
export function DepthIndicator({ depth, scrollProgress }) {
  const formatDepth = useCallback((d) => {
    if (d < 1000) return `${d} m`;
    return `${(d / 1000).toFixed(2)} km`;
  }, []);

  // Détermine la zone actuelle
  const currentZone = useMemo(() => {
    if (depth < 200) return "Épipélagique";
    if (depth < 1000) return "Mésopélagique";
    if (depth < 4000) return "Bathyale";
    if (depth < 6000) return "Abyssale";
    return "Hadale";
  }, [depth]);

  return (
    <div
      className="fixed left-4 top-1/2 -translate-y-1/2 z-40 pointer-events-none hidden md:flex flex-col items-center gap-2"
      aria-hidden="true"
    >
      {/* Barre verticale de progression */}
      <div className="relative w-1 h-48 rounded-full bg-white/10 overflow-hidden">
        <div
          className="absolute top-0 left-0 w-full rounded-full transition-all duration-300"
          style={{
            height: `${scrollProgress * 100}%`,
            background: "linear-gradient(to bottom, #00e5ff, #4dff9f, #ff6b6b)",
          }}
        />
      </div>
      {/* Valeur de profondeur */}
      <div className="text-center">
        <div
          className="text-lg font-bold tabular-nums abyss-glow"
          style={{ color: "#00e5ff" }}
        >
          {formatDepth(depth)}
        </div>
        <div className="text-[10px] uppercase tracking-wider text-white/50 mt-1">
          {currentZone}
        </div>
      </div>
    </div>
  );
}