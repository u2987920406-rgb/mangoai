// EmptyState — état vide standard (l'audit relevait leur quasi-absence, §3.2 U7).
import type { ReactNode } from "react";
import { cx, TEXT } from "./tokens";

export interface EmptyStateProps {
  /** Icône lucide (taille conseillée 28-32). */
  icon?: ReactNode;
  title: string;
  description?: string;
  /** Action proposée (souvent un <Button variant="primary">). */
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cx("flex flex-col items-center justify-center gap-2 px-6 py-12 text-center", className)}>
      {icon && <div className="mb-1 text-faint">{icon}</div>}
      <div className={cx(TEXT.md, "font-medium text-ink")}>{title}</div>
      {description && <p className={cx(TEXT.base, "max-w-[360px] leading-relaxed text-dim")}>{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
