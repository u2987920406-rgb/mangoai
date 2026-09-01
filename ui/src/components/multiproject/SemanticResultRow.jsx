import { FileCode2 } from "lucide-react";
import CategoryBadge from "./CategoryBadge.jsx";

// Ligne de résultat de recherche sémantique — extrait verbatim de MultiProject.jsx.
export default function SemanticResultRow({ result }) {
  const fileName = result.file.split("/").pop();
  return (
    <div className="rounded-lg border border-edge bg-bg px-4 py-3">
      <div className="flex items-start gap-3">
        <FileCode2 size={14} className="text-dim flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm text-ink font-medium truncate">{fileName}</p>
            <CategoryBadge category={result.category ?? "other"} />
            <span
              className="rounded-full px-2 py-0.5 text-xs font-semibold"
              style={{ background: "rgba(255,149,0,0.15)", color: "#c96a00" }}
            >
              score {result.score}
            </span>
          </div>
          <p className="text-xs text-faint mt-0.5 font-mono truncate">
            {result.project}/{result.file}
          </p>
          {result.summary && (
            <p className="text-xs text-dim mt-1.5 leading-relaxed">{result.summary}</p>
          )}
        </div>
      </div>
    </div>
  );
}
