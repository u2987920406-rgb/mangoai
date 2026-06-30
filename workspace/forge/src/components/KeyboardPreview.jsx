import { useMemo } from "react";

// ── Aperçu visuel du clavier en CSS pur ──────────────────────────────────────
// Rendu des touches selon le format (rows) et la couleur des keycaps choisie.

const U = 40; // 1u = 40px (échelle de base, responsive via container)
const GAP = 3;

// Touches d'accent (lettres qui prennent la couleur accent du keycap)
const ACCENT_KEYS = new Set(["Enter", "Shift", "Space", "Esc", "Tab", "Caps", "⌫", "Del"]);

export function KeyboardPreview({ format, keycap, rgbOn, pressedKey }) {
  const rows = format?.rows ?? [];

  // Largeur totale max pour calculer l'échelle responsive
  const maxRowWidth = useMemo(() => {
    let max = 0;
    for (const row of rows) {
      const w = row.reduce((sum, k) => sum + (k.w > 0 ? k.w : 0), 0);
      if (w > max) max = w;
    }
    return max;
  }, [rows]);

  const totalU = maxRowWidth || 15;
  const boardWidth = totalU * U + (totalU - 1) * GAP + 24; // padding 12*2

  return (
    <div className="forge-scroll-thin w-full overflow-x-auto">
      <div
        className="forge-metal mx-auto rounded-2xl p-3 transition-all duration-300"
        style={{
          width: boardWidth,
          maxWidth: "100%",
          background: rgbOn
            ? "linear-gradient(145deg, hsl(220 10% 12%), hsl(220 10% 6%))"
            : "linear-gradient(145deg, hsl(220 10% 14%), hsl(220 10% 9%))",
          boxShadow: rgbOn
            ? "inset 0 1px 0 hsl(0 0% 100% / 0.06), 0 0 60px -10px hsl(280 80% 60% / 0.3), 0 8px 32px hsl(220 13% 4% / 0.7)"
            : "inset 0 1px 0 hsl(0 0% 100% / 0.05), 0 8px 32px hsl(220 13% 4% / 0.6)",
        }}
      >
        {/* Glow RGB sous les touches */}
        {rgbOn && (
          <div
            className="forge-rgb pointer-events-none absolute inset-0 rounded-2xl opacity-20"
            style={{
              background:
                "linear-gradient(90deg, hsl(0 90% 55%), hsl(60 90% 55%), hsl(120 90% 55%), hsl(180 90% 55%), hsl(240 90% 55%), hsl(300 90% 55%))",
              filter: "blur(20px)",
            }}
          />
        )}

        <div className="relative space-y-[3px]">
          {rows.map((row, ri) => (
            <div key={ri} className="flex gap-[3px]" style={{ minHeight: U }}>
              {row.map((key, ki) => {
                if (key.w === 0) {
                  // Trou (TKL spacing)
                  return <div key={ki} style={{ width: 0 }} />;
                }
                if (key.w < 1 && key.l === "") {
                  // Petit gap
                  return <div key={ki} style={{ width: key.w * U }} />;
                }
                const w = key.w * U;
                const isAccent = ACCENT_KEYS.has(key.l);
                const bg = isAccent ? keycap.accentColor : keycap.baseColor;
                const legend = isAccent
                  ? keycap.baseColor === keycap.accentColor
                    ? keycap.legendColor
                    : keycap.baseColor
                  : keycap.legendColor;
                const isPressed = pressedKey === `${ri}-${ki}`;

                return (
                  <div
                    key={ki}
                    className={`forge-keycap relative flex items-center justify-center rounded-md text-[9px] font-semibold select-none ${
                      isPressed ? "forge-keycap-pressed" : ""
                    }`}
                    style={{
                      width: w,
                      height: U,
                      minWidth: w,
                      background: `linear-gradient(160deg, ${bg}, ${shade(bg, -12)})`,
                      color: legend,
                      boxShadow: rgbOn
                        ? `inset 0 1px 0 hsl(0 0% 100% / 0.12), inset 0 -2px 0 hsl(0 0% 0% / 0.3), 0 1px 2px hsl(0 0% 0% / 0.4), 0 0 6px hsl(280 80% 60% / 0.15)`
                        : `inset 0 1px 0 hsl(0 0% 100% / 0.08), inset 0 -2px 0 hsl(0 0% 0% / 0.25), 0 1px 2px hsl(0 0% 0% / 0.4)`,
                      fontFamily: "var(--font-mono)",
                      textShadow: "0 1px 1px hsl(0 0% 0% / 0.3)",
                    }}
                  >
                    {key.l}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Assombrir une couleur hex
function shade(hex, percent) {
  const num = parseInt(hex.replace("#", ""), 16);
  const r = Math.max(0, Math.min(255, (num >> 16) + Math.round((num >> 16) * percent) / 100));
  const g = Math.max(0, Math.min(255, ((num >> 8) & 0xff) + Math.round(((num >> 8) & 0xff) * percent) / 100));
  const b = Math.max(0, Math.min(255, (num & 0xff) + Math.round((num & 0xff) * percent) / 100));
  return `#${((1 << 24) | (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b)).toString(16).slice(1)}`;
}