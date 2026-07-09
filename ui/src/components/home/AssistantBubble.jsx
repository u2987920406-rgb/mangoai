import { useState } from "react";
import { Copy } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Bulle de réponse assistant (markdown + vote RLHF 👍/👎) — extrait verbatim de Home.jsx.
export default function AssistantBubble({ content, onFeedback }) {
  const [copied, setCopied] = useState(false);
  const [voted, setVoted] = useState(null); // "like" | "dislike" | null
  function copy() {
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }
  function vote(rating) {
    if (voted) return;
    setVoted(rating);
    onFeedback?.(rating, content);
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="md md-chat text-[17px] text-ink-soft leading-8 break-words">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
      </div>
      <div className="flex items-center gap-2">
        <button onClick={copy} title="Copier" className="flex items-center gap-1 text-[11px] text-faint hover:text-dim transition-colors">
          <Copy size={12} /> {copied ? "Copié !" : "Copier"}
        </button>
        <button
          onClick={() => vote("like")}
          disabled={!!voted}
          title="J'aime — MangoOS en retient le pattern"
          className={`rounded-lg px-1.5 py-0.5 text-xs transition-colors disabled:cursor-default ${
            voted === "like" ? "bg-green-500/20 text-green-500" : voted ? "text-faint opacity-30" : "text-faint hover:text-green-500 hover:bg-green-500/10"
          }`}
        >
          👍
        </button>
        <button
          onClick={() => vote("dislike")}
          disabled={!!voted}
          title="Je n'aime pas — MangoOS évitera ce pattern"
          className={`rounded-lg px-1.5 py-0.5 text-xs transition-colors disabled:cursor-default ${
            voted === "dislike" ? "bg-err/20 text-err" : voted ? "text-faint opacity-30" : "text-faint hover:text-err hover:bg-err/10"
          }`}
        >
          👎
        </button>
        {voted && (
          <span className="text-[10px] text-faint">{voted === "like" ? "Pattern retenu ✓" : "Pattern évité ✓"}</span>
        )}
      </div>
    </div>
  );
}
