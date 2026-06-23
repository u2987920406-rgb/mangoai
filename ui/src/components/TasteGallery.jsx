// Moteur de Goût (#149) — galerie cockpit : génère K variantes (skins) d'un projet,
// les affiche au fur et à mesure (SSE), 1 tap = choix (+ 1 mot) → axiome de goût (GLM souverain).
import { useState, useEffect, useRef } from "react";
import { Wand2, Check, Loader2 } from "lucide-react";

export default function TasteGallery({ win }) {
  const initial = win?.props?.projectName || "";
  const [projects, setProjects] = useState([]);
  const [project, setProject] = useState(initial);
  const [skins, setSkins] = useState([]); // { id, name, image, palette, ok, reason }
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [chosen, setChosen] = useState(null);
  const [note, setNote] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/projects")
      .then((r) => r.json())
      .then((d) => {
        const list = Array.isArray(d) ? d : d.projects || [];
        const names = list.map((p) => (typeof p === "string" ? p : p.name)).filter(Boolean);
        setProjects(names);
        if (!initial && names.length) setProject(names[0]);
      })
      .catch(() => {});
  }, [initial]);

  async function generate() {
    if (!project || busy) return;
    setBusy(true);
    setSkins([]);
    setChosen(null);
    setSaved(false);
    setStatus("Démarrage…");
    try {
      const res = await fetch(`/api/taste/${encodeURIComponent(project)}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ k: 4 }),
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        setStatus("⚠ " + (j.error || `HTTP ${res.status}`));
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop();
        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith("data:")) continue;
          let ev;
          try { ev = JSON.parse(line.slice(5).trim()); } catch { continue; }
          if (ev.type === "status") setStatus(ev.text);
          else if (ev.type === "skin" && ev.skin) setSkins((prev) => [...prev, ev.skin]);
          else if (ev.type === "done") setStatus("");
          else if (ev.type === "error") setStatus("⚠ " + ev.error);
        }
      }
    } catch (e) {
      setStatus("⚠ " + (e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function choose() {
    if (!chosen) return;
    const skin = skins.find((s) => s.id === chosen);
    try {
      await fetch(`/api/taste/${encodeURIComponent(project)}/choose`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chosenId: chosen,
          chosenName: skin?.name,
          palette: skin?.palette,
          shown: skins.map((s) => s.name),
          note,
          model: "eleve",
        }),
      });
      setSaved(true);
    } catch {
      /* best-effort */
    }
  }

  const okSkins = skins.filter((s) => s.ok !== false);

  return (
    <div className="flex h-full flex-col bg-bg text-ink">
      {/* Barre du haut : projet + générer */}
      <div className="flex items-center gap-3 border-b border-edge bg-panel/70 px-4 py-3 backdrop-blur-sm">
        <Wand2 size={18} className="text-accent-soft" />
        <span className="text-[13px] font-semibold">Variantes de goût</span>
        <select
          value={project}
          onChange={(e) => setProject(e.target.value)}
          disabled={busy}
          className="ml-2 rounded-lg border border-edge bg-raised px-2 py-1 text-[12.5px] text-ink outline-none disabled:opacity-50"
        >
          {!project && <option value="">— projet —</option>}
          {projects.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <button
          onClick={generate}
          disabled={busy || !project}
          className="ml-auto flex items-center gap-2 rounded-lg bg-accent px-3 py-1.5 text-[12.5px] font-semibold text-white shadow-sm transition hover:opacity-90 disabled:opacity-50"
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Wand2 size={15} />}
          {busy ? "Génération…" : "Générer 4 variantes"}
        </button>
      </div>

      {/* Statut */}
      {(status || busy) && (
        <div className="flex items-center gap-2 border-b border-edge/60 bg-raised/40 px-4 py-1.5 text-[11.5px] text-dim">
          {busy && <Loader2 size={13} className="animate-spin text-accent-soft" />}
          {status || "…"}
        </div>
      )}

      {/* Grille des skins */}
      <div className="flex-1 overflow-auto p-4">
        {okSkins.length === 0 && !busy ? (
          <div className="grid h-full place-items-center text-center text-[12.5px] text-faint">
            <div>
              <Wand2 size={26} className="mx-auto mb-2 text-edge" />
              Choisis un projet et lance la génération.<br />
              MangoOS produit 4 habillages ancrés sur du vrai design, tu choisis ton préféré.
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {okSkins.map((s) => {
              const active = chosen === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => { setChosen(s.id); setSaved(false); }}
                  className={`group overflow-hidden rounded-2xl border text-left shadow-lg shadow-black/20 backdrop-blur-sm transition ${
                    active ? "border-accent ring-2 ring-accent/50" : "border-edge hover:border-accent-soft/60"
                  }`}
                >
                  <div className="relative aspect-[16/10] w-full bg-white">
                    <img src={s.image} alt={s.name} className="h-full w-full object-cover object-top" />
                    {active && (
                      <div className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-accent text-white shadow">
                        <Check size={14} />
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 bg-panel/70 px-3 py-2">
                    <span className="text-[12.5px] font-medium text-ink">{s.name}</span>
                    <span className="ml-auto flex gap-1">
                      {(s.palette || []).slice(0, 5).map((c, i) => (
                        <span key={i} className="h-3 w-3 rounded-full border border-edge/50" style={{ background: c }} />
                      ))}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Choix + distillation */}
      {okSkins.length > 0 && (
        <div className="flex items-center gap-3 border-t border-edge bg-panel/70 px-4 py-3 backdrop-blur-sm">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Un mot (optionnel) : « trop froid », « parfait »…"
            className="flex-1 rounded-lg border border-edge bg-raised px-3 py-1.5 text-[12.5px] text-ink outline-none placeholder:text-faint"
          />
          {saved ? (
            <span className="flex items-center gap-1.5 text-[12.5px] font-medium text-sys-green">
              <Check size={15} /> Goût enregistré
            </span>
          ) : (
            <button
              onClick={choose}
              disabled={!chosen}
              className="rounded-lg bg-accent px-3 py-1.5 text-[12.5px] font-semibold text-white shadow-sm transition hover:opacity-90 disabled:opacity-40"
            >
              Valider mon choix
            </button>
          )}
        </div>
      )}
    </div>
  );
}
