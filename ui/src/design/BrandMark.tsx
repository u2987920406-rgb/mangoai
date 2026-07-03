// BrandMark — la marque « MangoOS » : dégradé mangue + petite branche courbe posée
// sur la pointe droite du S, feuille verte au bout (signature validée par Raf, B1).
import { cx } from "./tokens";

export interface BrandMarkProps {
  /** Taille de police en px (la feuille suit proportionnellement). */
  size?: number;
  className?: string;
}

export function BrandMark({ size = 15, className }: BrandMarkProps) {
  const leaf = Math.round(size * 0.68);
  return (
    <span className={cx("relative inline-block font-semibold tracking-tight", className)} style={{ fontSize: size }}>
      Mango
      <span className="relative inline-block">
        {/* Le coin bas-gauche du SVG (départ de la branche) est posé sur le haut
            de l'extrémité DROITE du S ; la branche se courbe bas-gauche → haut-droite. */}
        <svg width={leaf} height={leaf} viewBox="0 0 14 14" className="absolute -top-[0.34em] -right-[0.46em]" aria-hidden="true">
          {/* branche = un tout petit bout posé sur le haut droit du S */}
          <path d="M1.6 13.8 Q2.4 13.4 3.9 11.6" stroke="#8a5a2b" strokeWidth="1.5" fill="none" strokeLinecap="round" />
          {/* feuille ouverte, large, qui occupe presque tout */}
          <path d="M3.9 11.6 Q3 1.4 13.4 1.1 Q13.9 11.3 3.9 11.6 Z" fill="#34c759" />
          <path d="M5 10.4 Q8.4 5.6 12.5 2" stroke="#1e8f42" strokeWidth="0.7" fill="none" strokeLinecap="round" />
        </svg>
        <span className="bg-gradient-to-r from-yellow-400 via-orange-400 to-red-400 bg-clip-text text-transparent">OS</span>
      </span>
    </span>
  );
}
