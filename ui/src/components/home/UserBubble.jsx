import { useState } from "react";
import { Copy, Paperclip, RefreshCw } from "lucide-react";
import { splitFileBlocks } from "./helpers.js";

// Bulle de message utilisateur (avec puces de fichiers joints) — extrait
// verbatim de Home.jsx.
export default function UserBubble({ content, onRegenerate, thinking }) {
  const { files, clean } = splitFileBlocks(content);
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(clean).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="max-w-[85%] rounded-2xl bg-raised px-5 py-3 text-[17px] text-ink-soft leading-7">
        {files.length > 0 && (
          <div className="mb-2 flex flex-wrap justify-end gap-1.5">
            {files.map((f, i) => (
              <span key={i} className="flex items-center gap-1 rounded-lg border border-accent/30 bg-accent/10 px-2 py-0.5 text-xs text-accent-soft">
                <Paperclip size={11} /> {f}
              </span>
            ))}
          </div>
        )}
        {clean}
      </div>
      <div className="flex items-center gap-2 pr-1">
        <button
          onClick={onRegenerate}
          disabled={thinking}
          title="Relancer — régénérer la réponse à ce message"
          className="flex items-center gap-1 text-[11px] text-faint hover:text-accent-soft disabled:opacity-30 transition-colors"
        >
          <RefreshCw size={12} /> Relancer
        </button>
        <button onClick={copy} title="Copier" className="flex items-center gap-1 text-[11px] text-faint hover:text-dim transition-colors">
          <Copy size={12} /> {copied ? "Copié !" : "Copier"}
        </button>
      </div>
    </div>
  );
}
