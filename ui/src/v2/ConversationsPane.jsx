// Écran « Conversation » du shell 2.0 : liste les discussions d'accueil sauvegardées
// (auto-save) et permet d'y REVENIR (clic → rouvre dans l'Accueil) ou de les supprimer.
import { useCallback, useEffect, useState } from "react";
import { MessagesSquare, Trash2, ArrowRight } from "lucide-react";
import { useAppState } from "../state/AppState";
import { Button, EmptyState, cx, TEXT } from "../design";

function whenLabel(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("fr-FR", {
      day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export default function ConversationsPane() {
  const { openConversation, pushToast } = useAppState();
  const [list, setList] = useState(null); // null = en chargement

  const refresh = useCallback(() => {
    fetch("/api/home/conversations")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setList(Array.isArray(d) ? d : []))
      .catch(() => setList([]));
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const remove = async (convId, e) => {
    e.stopPropagation();
    try {
      await fetch(`/api/home/conversations/${encodeURIComponent(convId)}`, { method: "DELETE" });
      setList((prev) => (prev ?? []).filter((c) => c.convId !== convId));
    } catch {
      pushToast("error", "Suppression impossible.");
    }
  };

  return (
    <div className="mx-auto w-full max-w-[760px] animate-fade-up px-8 py-10">
      <h1 className={TEXT.xl}>Conversation</h1>
      <p className={cx(TEXT.base, "mt-1.5 text-dim")}>
        Reprends une discussion passée avec Mango — elles sont sauvegardées automatiquement.
      </p>

      <div className="mt-7">
        {list === null ? (
          <div className={cx(TEXT.base, "py-10 text-center text-faint")}>Chargement…</div>
        ) : list.length === 0 ? (
          <div className="rounded-xl border border-edge-soft bg-panel">
            <EmptyState
              icon={<MessagesSquare size={30} />}
              title="Aucune conversation pour l'instant"
              description="Discute avec Mango depuis l'Accueil : la conversation apparaîtra ici pour que tu puisses y revenir."
              action={<Button variant="primary" onClick={() => openConversation("")}>Aller à l'Accueil</Button>}
            />
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {list.map((c) => (
              <button
                key={c.convId}
                onClick={() => openConversation(c.convId)}
                className="group flex items-center gap-3 rounded-xl border border-edge bg-panel px-4 py-3 text-left transition-colors hover:border-faint hover:bg-raised focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
              >
                <MessagesSquare size={16} className="shrink-0 text-faint group-hover:text-accent" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-ink">{c.title || "Conversation"}</p>
                  <p className="mt-0.5 text-[11px] text-faint">
                    {whenLabel(c.updatedAt)}{c.count ? ` · ${c.count} message${c.count > 1 ? "s" : ""}` : ""}
                  </p>
                </div>
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => remove(c.convId, e)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") remove(c.convId, e); }}
                  title="Supprimer cette conversation"
                  aria-label="Supprimer"
                  className="shrink-0 rounded-lg p-1.5 text-faint opacity-0 transition-opacity hover:text-err group-hover:opacity-100"
                >
                  <Trash2 size={14} />
                </span>
                <ArrowRight size={14} className="shrink-0 text-faint opacity-0 transition-opacity group-hover:opacity-100" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
