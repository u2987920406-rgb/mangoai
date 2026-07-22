import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

// Generic styled dropdown replacing native <select>. `children` may be a
// function receiving a close() callback so menu items can dismiss the menu.
export default function Dropdown({ button, children, align = "right", width = "w-60", disabled, buttonClass, dataTour }) {
  const defaultButtonClass =
    "flex h-9 items-center gap-1.5 rounded-lg border border-edge bg-panel px-2 sm:px-3 text-[13px] text-ink hover:border-faint transition-colors disabled:opacity-40 disabled:cursor-not-allowed";
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (!ref.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        disabled={disabled}
        data-tour={dataTour}
        onClick={() => setOpen((o) => !o)}
        className={buttonClass ?? defaultButtonClass}
      >
        {button}
        <ChevronDown
          size={14}
          className={`text-dim transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div
          className={`animate-pop absolute top-full mt-1.5 ${align === "right" ? "right-0" : "left-0"} ${width} z-50 max-h-80 overflow-y-auto nice-scroll rounded-xl border border-edge bg-raised p-1.5 shadow-2xl shadow-black/50`}
        >
          {typeof children === "function" ? children(() => setOpen(false)) : children}
        </div>
      )}
    </div>
  );
}

export function DropdownItem({ icon: Icon, label, hint, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors ${
        active ? "bg-accent/15 text-ink" : "text-ink hover:bg-edge-soft"
      }`}
    >
      {Icon && <Icon size={15} className={`mt-0.5 shrink-0 ${active ? "text-accent-soft" : "text-dim"}`} />}
      <span className="min-w-0">
        <span className="block truncate font-medium">{label}</span>
        {hint && <span className="block text-xs text-dim truncate">{hint}</span>}
      </span>
    </button>
  );
}
