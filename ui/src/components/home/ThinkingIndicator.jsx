import { Loader2 } from "lucide-react";

// Indicateur « … réfléchit » — extrait verbatim de Home.jsx.
export default function ThinkingIndicator({ label = "MangoOS" }) {
  return (
    <div className="flex items-center gap-2 self-start rounded-xl border border-accent/25 bg-accent/[0.07] px-3.5 py-2 text-[13px] font-medium text-accent-soft shadow-sm">
      <Loader2 size={15} className="animate-spin" />
      <span>{label} réfléchit<span className="animate-pulse">…</span></span>
    </div>
  );
}
