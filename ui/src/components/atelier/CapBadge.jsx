import { Eye } from "lucide-react";
import { CAP_LABEL } from "./constants.js";

export default function CapBadge({ cap }) {
  const vis = cap === "vision";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${
        vis ? "border-accent/40 bg-accent/12 text-accent" : "border-edge bg-edge-soft text-dim"
      }`}
    >
      {vis && <Eye size={9} />}
      {CAP_LABEL[cap] ?? cap}
    </span>
  );
}
