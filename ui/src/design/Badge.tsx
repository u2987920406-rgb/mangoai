// Badge (statut, lecture seule) & Chip (pilule interactive) — remplacent 15-20 variantes inline.
import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes } from "react";
import { cx, FOCUS_RING, TRANSITION } from "./tokens";

export type BadgeTone = "neutral" | "ok" | "warn" | "err" | "accent";

const TONE: Record<BadgeTone, string> = {
  neutral: "border border-edge text-dim",
  ok: "bg-ok/12 text-ok",
  warn: "bg-warn/12 text-warn",
  err: "bg-err/12 text-err",
  accent: "bg-accent/12 text-accent-soft",
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

/** Étiquette de statut, non interactive. */
export function Badge({ tone = "neutral", className, children, ...rest }: BadgeProps) {
  return (
    <span
      className={cx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium", TONE[tone], className)}
      {...rest}
    >
      {children}
    </span>
  );
}

export interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** État sélectionné (multi-choix, filtres, suggestions). */
  selected?: boolean;
}

/** Pilule interactive : suggestions, filtres, tags cliquables. */
export const Chip = forwardRef<HTMLButtonElement, ChipProps>(function Chip(
  { selected = false, className, children, type, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type ?? "button"}
      aria-pressed={selected}
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px]",
        TRANSITION.control,
        FOCUS_RING,
        selected ? "border border-accent/60 bg-accent/12 text-accent-soft" : "border border-edge text-dim hover:border-faint hover:text-ink",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
});
