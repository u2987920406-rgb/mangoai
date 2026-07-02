// Input & Textarea — champs de saisie standard (remplacent les 10+ variantes inline).
import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cx, RADIUS, TRANSITION } from "./tokens";

const FIELD =
  "w-full border border-edge bg-bg px-2.5 text-[13px] text-ink outline-none " +
  "placeholder:text-faint focus:border-faint disabled:opacity-50";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Bord rouge + aria-invalid (validation). */
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { invalid = false, className, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cx("h-8", FIELD, RADIUS.control, TRANSITION.control, invalid && "border-err focus:border-err", className)}
      {...rest}
    />
  );
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { invalid = false, className, rows = 3, ...rest },
  ref,
) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      aria-invalid={invalid || undefined}
      className={cx("resize-none py-2 leading-relaxed", FIELD, RADIUS.control, TRANSITION.control, invalid && "border-err focus:border-err", className)}
      {...rest}
    />
  );
});
