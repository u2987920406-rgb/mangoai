// Button — LE bouton de MangoOS 2.0. Remplace les ~50 variantes inline recensées
// par l'audit (audit-mango-2.0 §3.2 U2). 4 variantes × 3 tailles + icon-only.
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cx, FOCUS_RING, RADIUS, TRANSITION } from "./tokens";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-accent text-white hover:brightness-110 active:scale-[0.98]",
  secondary: "border border-edge bg-raised text-ink hover:border-faint",
  ghost: "text-dim hover:bg-raised hover:text-ink",
  danger: "bg-err text-white hover:brightness-110 active:scale-[0.98]",
};

const SIZE: Record<ButtonSize, string> = {
  sm: "h-7 px-2.5 text-[12px]",
  md: "h-8 px-3 text-[13px]",
  lg: "h-9 px-4 text-[13.5px]",
};

const ICON_ONLY: Record<ButtonSize, string> = {
  sm: "h-7 w-7",
  md: "h-8 w-8",
  lg: "h-9 w-9",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Icône lucide (ou tout nœud) affichée avant le libellé. */
  icon?: ReactNode;
  /** true = bouton carré icône seule (children ignorés visuellement, fournir title/aria-label). */
  iconOnly?: boolean;
  /** Affiche un spinner et désactive le bouton. */
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", icon, iconOnly = false, loading = false, className, children, disabled, type, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type ?? "button"}
      disabled={disabled || loading}
      className={cx(
        "inline-flex select-none items-center justify-center gap-1.5 font-medium",
        RADIUS.control,
        TRANSITION.all,
        FOCUS_RING,
        VARIANT[variant],
        iconOnly ? ICON_ONLY[size] : SIZE[size],
        (disabled || loading) && "pointer-events-none opacity-50",
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 size={15} className="animate-spin" /> : icon}
      {!iconOnly && children}
    </button>
  );
});
