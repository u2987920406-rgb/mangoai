// #138 OS d'apps — Fenêtre « Suite » : le shell qui RÉVÈLE que les apps se parlent.
//
// Trois zones : (a) les apps conformes (manifest .mangoapp.json) avec bouton
// Ouvrir, (b) le graphe des collections partagées (qui lit / qui écrit), (c) un
// aperçu LIVE de la donnée d'une collection (polling 2 s). Lecture seule —
// aucune génération ici. Esthétique calquée sur ProjectsWindow / le reste de l'OS.
import { useEffect, useState, useCallback } from "react";
import {
  Boxes, FolderOpen, ArrowRight, Database, Eye, RefreshCw,
  LayoutGrid, Play, Square, Loader2, AlertTriangle,
} from "lucide-react";

const POLL_MS = 2000;

export default function SuiteWindow({ win, onClose }) {
  const onOpen = win.props?.onOpen;
  const [apps, setApps] = useState([]);
  const [collections, setCollections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null); // collection name sous aperçu live
  const [docs, setDocs] = useState([]);
  const [liveGrid, setLiveGrid] = useState(false); // grille d'aperçus live (opt-in : démarre des serveurs Vite)
  const [previews, setPreviews] = useState({});    // project -> { status: starting|live|error, url?, error? }

  // Démarre (ou réutilise) l'aperçu Vite de chaque app — le pool serveur les tient
  // côte à côte, chacun sur son port (#138-P2). Séquentiel : un vite à la fois au boot.
  const startPreviews = useCallback(async (list) => {
    for (const { project } of list) {
      setPreviews((p) => ({ ...p, [project]: { status: "starting" } }));
      try {
        const r = await fetch(`/api/preview/${encodeURIComponent(project)}`, { method: "POST" });
        const d = await r.json();
        setPreviews((p) => ({
          ...p,
          [project]: r.ok && d.url ? { status: "live", url: d.url } : { status: "error", error: d.error },
        }));
      } catch {
        setPreviews((p) => ({ ...p, [project]: { status: "error" } }));
      }
    }
  }, []);

  const toggleLiveGrid = useCallback(() => {
    setLiveGrid((on) => {
      const next = !on;
      if (next) startPreviews(apps);
      else setPreviews({});
      return next;
    });
  }, [apps, startPreviews]);

  const loadSuite = useCallback(async () => {
    try {
      const r = await fetch("/api/suite/apps");
      const d = await r.json();
      setApps(d.apps ?? []);
      setCollections(d.collections ?? []);
    } catch {
      /* backend hors-ligne — on garde l'état précédent */
    } finally {
      setLoading(false);
    }
  }, []);

  // Poll du graphe des apps/collections (une app peut se déclarer en cours de route).
  useEffect(() => {
    loadSuite();
    const id = setInterval(loadSuite, POLL_MS);
    return () => clearInterval(id);
  }, [loadSuite]);

  // Poll de l'aperçu live de la collection sélectionnée.
  useEffect(() => {
    if (!selected) {
      setDocs([]);
      return;
    }
    let alive = true;
    const fetchDocs = async () => {
      try {
        const r = await fetch(`/api/suite/collection/${encodeURIComponent(selected)}`);
        const d = await r.json();
        if (alive) setDocs(d.docs ?? []);
      } catch {
        /* on garde l'état */
      }
    };
    fetchDocs();
    const id = setInterval(fetchDocs, POLL_MS);
    return () => { alive = false; clearInterval(id); };
  }, [selected]);

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto nice-scroll p-4">
      {/* En-tête */}
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-accent/20 bg-accent/[0.08] text-accent-soft">
          <Boxes size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold text-ink">OS d'apps — la suite composable</p>
          <p className="text-[11px] text-faint">Les apps conformes partagent leurs données et se parlent.</p>
        </div>
        {apps.length > 0 && (
          <button
            onClick={toggleLiveGrid}
            title={liveGrid ? "Arrêter les aperçus live" : "Lancer les aperçus live côte à côte"}
            className={`flex h-7 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-medium transition-colors ${
              liveGrid
                ? "border-accent/50 bg-accent/[0.12] text-accent-soft"
                : "border-edge text-dim hover:text-accent-soft hover:border-accent/40"
            }`}
          >
            {liveGrid ? <Square size={12} /> : <Play size={12} />}
            Aperçus live
          </button>
        )}
        <button
          onClick={loadSuite}
          title="Rafraîchir"
          className="flex h-7 w-7 items-center justify-center rounded-lg border border-edge text-faint hover:text-accent-soft hover:border-accent/40 transition-colors"
        >
          <RefreshCw size={13} />
        </button>
      </div>

      {loading ? (
        <p className="py-8 text-center text-xs text-faint">Chargement de la suite…</p>
      ) : apps.length === 0 ? (
        <div className="rounded-xl border border-dashed border-edge bg-bg/50 px-4 py-8 text-center">
          <p className="text-[13px] text-dim">Aucune app composable pour l'instant.</p>
          <p className="mt-1 text-[11px] text-faint">
            Génère une app en mode <span className="font-semibold text-accent-soft">🧩 App composable</span> :
            elle écrira un <code className="rounded bg-edge-soft px-1 font-mono text-accent">.mangoapp.json</code> et apparaîtra ici.
          </p>
        </div>
      ) : (
        <>
          {/* (a) Apps conformes */}
          <section>
            <p className="mb-2 px-0.5 text-[10px] font-semibold uppercase tracking-widest text-faint">
              Apps de la suite ({apps.length})
            </p>
            <div className="grid grid-cols-2 gap-2">
              {apps.map(({ project, manifest }) => (
                <div
                  key={project}
                  className="group flex items-center gap-2.5 rounded-xl border border-edge bg-bg px-3 py-2.5 hover:border-accent/50 hover:bg-raised transition-colors"
                >
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[15px]"
                    style={{ backgroundColor: (manifest.color ?? "#f59e0b") + "22" }}
                  >
                    {manifest.icon ?? "📦"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12.5px] font-medium text-ink">{manifest.name}</p>
                    <p className="truncate text-[10.5px] text-faint">
                      {manifest.collections?.length
                        ? manifest.collections.map((c) => c.name).join(" · ")
                        : "aucune collection partagée"}
                    </p>
                  </div>
                  <button
                    onClick={() => { onOpen?.(project, {}); onClose(win.id); }}
                    title="Ouvrir l'app"
                    className="flex shrink-0 items-center gap-1 rounded-lg border border-edge px-2 py-1 text-[11px] text-dim opacity-0 group-hover:opacity-100 hover:text-accent-soft hover:border-accent/40 transition-all"
                  >
                    <FolderOpen size={12} /> Ouvrir
                  </button>
                </div>
              ))}
            </div>
          </section>

          {/* (a-bis) Grille d'aperçus LIVE — le cockpit de l'OS : les apps côte à côte,
              chacune sur son port (pool #138-P2), qui se synchronisent en direct. */}
          {liveGrid && (
            <section>
              <p className="mb-2 flex items-center gap-1.5 px-0.5 text-[10px] font-semibold uppercase tracking-widest text-faint">
                <LayoutGrid size={11} className="text-accent-soft" /> Aperçus live · côte à côte
              </p>
              <div className="grid grid-cols-2 gap-3">
                {apps.map(({ project, manifest }) => {
                  const pv = previews[project] ?? { status: "starting" };
                  return (
                    <div
                      key={project}
                      className="flex flex-col overflow-hidden rounded-2xl border border-edge bg-panel/70 shadow-lg shadow-black/20 backdrop-blur-sm"
                    >
                      {/* barre de titre translucide */}
                      <div className="flex items-center gap-2 border-b border-edge/70 bg-bg/40 px-2.5 py-1.5">
                        <span
                          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[11px]"
                          style={{ backgroundColor: (manifest.color ?? "#f59e0b") + "22" }}
                        >
                          {manifest.icon ?? "📦"}
                        </span>
                        <p className="min-w-0 flex-1 truncate text-[11.5px] font-medium text-ink">{manifest.name}</p>
                        {pv.status === "live" && (
                          <span className="flex items-center gap-1 text-[9.5px] font-semibold uppercase tracking-wide text-emerald-400/90">
                            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" /> live
                          </span>
                        )}
                      </div>
                      {/* surface d'aperçu */}
                      <div className="relative h-52 bg-bg">
                        {pv.status === "live" && pv.url ? (
                          <iframe
                            key={pv.url}
                            src={pv.url}
                            title={manifest.name}
                            className="h-full w-full border-0 bg-white"
                            sandbox="allow-scripts allow-same-origin allow-forms"
                          />
                        ) : pv.status === "error" ? (
                          <div className="flex h-full flex-col items-center justify-center gap-1.5 px-3 text-center">
                            <AlertTriangle size={18} className="text-amber-400/80" />
                            <p className="text-[11px] text-dim">Aperçu indisponible</p>
                            <p className="text-[10px] text-faint">{pv.error ?? "le serveur n'a pas démarré"}</p>
                          </div>
                        ) : (
                          <div className="flex h-full flex-col items-center justify-center gap-2 text-faint">
                            <Loader2 size={18} className="animate-spin text-accent-soft" />
                            <p className="text-[11px]">Démarrage de l'aperçu…</p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="mt-2 px-0.5 text-[10.5px] text-faint">
                Modifie une donnée partagée dans une app : elle apparaît en direct dans les autres (chacune lit la
                même collection via <code className="rounded bg-edge-soft px-1 font-mono text-accent">/api/shared</code>).
              </p>
            </section>
          )}

          {/* (b) Graphe des collections partagées */}
          <section>
            <p className="mb-2 px-0.5 text-[10px] font-semibold uppercase tracking-widest text-faint">
              Données partagées
            </p>
            {collections.length === 0 ? (
              <p className="rounded-lg border border-edge bg-bg/50 px-3 py-3 text-[11px] text-faint">
                Aucune collection partagée déclarée — les apps ne se parlent pas encore.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {collections.map((c) => (
                  <button
                    key={c.name}
                    onClick={() => setSelected(selected === c.name ? null : c.name)}
                    className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                      selected === c.name ? "border-accent/50 bg-accent/[0.06]" : "border-edge bg-bg hover:border-accent/30"
                    }`}
                  >
                    <Database size={14} className="shrink-0 text-accent-soft" />
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-[12px] text-ink">
                        {c.name}
                        <span className="ml-2 rounded bg-edge-soft px-1.5 py-0.5 text-[10px] text-dim">{c.docCount} doc{c.docCount > 1 ? "s" : ""}</span>
                      </p>
                      <p className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-faint">
                        <span className="text-emerald-400/80">écrit&nbsp;: {c.writers.join(", ") || "—"}</span>
                        <ArrowRight size={10} className="text-faint" />
                        <span className="text-sky-400/80">lu&nbsp;: {c.readers.join(", ") || "—"}</span>
                      </p>
                    </div>
                    <Eye size={13} className={selected === c.name ? "text-accent-soft" : "text-faint"} />
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* (c) Aperçu live de la collection sélectionnée */}
          {selected && (
            <section>
              <p className="mb-2 px-0.5 text-[10px] font-semibold uppercase tracking-widest text-faint">
                Aperçu live · <span className="font-mono text-accent-soft">{selected}</span>
              </p>
              {docs.length === 0 ? (
                <p className="rounded-lg border border-edge bg-bg/50 px-3 py-3 text-[11px] text-faint">
                  Collection vide — ajoute une donnée dans une app pour la voir apparaître ici (poll 2 s).
                </p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {docs.map((doc) => (
                    <div key={doc.key} className="rounded-lg border border-edge bg-bg px-3 py-2">
                      <p className="font-mono text-[10.5px] text-faint">{doc.key}</p>
                      <pre className="mt-0.5 overflow-x-auto nice-scroll text-[11px] text-dim">
                        {JSON.stringify(doc.value, null, 2)}
                      </pre>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
