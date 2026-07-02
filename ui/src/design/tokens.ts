// Tokens du design system 2.0 — DA figée par la maquette B1 (docs/maquette-shell-2.0-accueil.png).
// Les COULEURS vivent dans index.css (@theme, variables CSS — clair/sombre au runtime).
// Ici : l'échelle typo/espacement/rayons/durées, pour que plus aucun écran ne réinvente
// un `text-[13px]` à la main — on compose ces chaînes Tailwind.

/** Échelle typographique (Inter). Une seule source pour les tailles de texte. */
export const TEXT = {
  /** métadonnées, kbd, badges */ xs: "text-[11px]",
  /** libellés secondaires, chips */ sm: "text-[12px]",
  /** corps par défaut de l'UI */ base: "text-[13px]",
  /** corps confortable (chat, formulaires) */ md: "text-[14px]",
  /** titres de panneau */ lg: "text-[16px] font-semibold tracking-tight",
  /** titres de page */ xl: "text-[20px] font-semibold tracking-tight",
} as const;

/** Libellé de section (sidebar, groupes de réglages). `text-dim` (pas `text-faint`)
 *  pour tenir le contraste AA à cette petite taille (audit a11y 2026-07-02). */
export const SECTION_LABEL =
  "text-[10.5px] font-semibold uppercase tracking-[0.08em] text-dim";

/** Rayons — 3 niveaux seulement. */
export const RADIUS = {
  control: "rounded-lg", // boutons, inputs, items de nav
  card: "rounded-xl", // cartes, groupes
  surface: "rounded-2xl", // modales, composer, palette
} as const;

/** Transitions standard — 150 ms partout, 250 ms pour les surfaces. */
export const TRANSITION = {
  control: "transition-colors duration-150",
  all: "transition-all duration-150",
  surface: "transition-all duration-250",
} as const;

/** Anneau de focus clavier — le même pour tout contrôle interactif. */
export const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent";

/** Compose des classes en ignorant les falsy (mini-clsx maison). */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
