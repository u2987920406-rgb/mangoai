// Carte d'escalade visuelle (Mango demande une référence de goût) — extraite de Chat.jsx (Phase C).
import { useState } from "react";

export default function EscalationCard({ projectName }) {
  const [ref, setRef] = useState("");
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);

  async function submit() {
    if (!ref.trim() || sending || sent) return;
    setSending(true);
    try {
      await fetch("/api/escalation-reference", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectName, referenceText: ref.trim() }),
      });
      setSent(true);
    } catch {}
    setSending(false);
  }

  return (
    <div className="animate-fade-up max-w-[95%] self-start">
      <div className="rounded-2xl rounded-tl-md border border-amber-500/30 bg-amber-500/[0.06] px-3.5 py-3 text-sm">
        <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-amber-500">
          <span>⚠</span>
          <span>MangoOS bloque sur le visuel</span>
        </div>
        {sent ? (
          <p className="text-xs text-ok">
            ✓ Référence reçue — axiome de goût enregistré. Redécris maintenant ce que tu veux changer.
          </p>
        ) : (
          <>
            <p className="mb-3 text-xs text-dim leading-relaxed">
              Je tourne en rond. Montre-moi une référence visuelle pour recadrer ma direction — une URL, un mot-clé, une description de style.
            </p>
            <div className="flex gap-2">
              <input
                autoFocus
                value={ref}
                onChange={(e) => setRef(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                placeholder="Ex: minimaliste noir, style Linear, site raycast.com…"
                className="flex-1 rounded-lg border border-edge bg-bg px-2.5 py-1.5 text-xs text-ink placeholder:text-faint focus:border-amber-500/60 focus:outline-none transition-colors"
                disabled={sending}
              />
              <button
                onClick={submit}
                disabled={!ref.trim() || sending}
                className="rounded-lg bg-amber-500/20 px-3 py-1.5 text-xs font-medium text-amber-500 hover:bg-amber-500/30 disabled:opacity-40 transition-colors"
              >
                {sending ? "…" : "Ancrer"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
