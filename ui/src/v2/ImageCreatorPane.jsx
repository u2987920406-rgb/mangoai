// Image Creator 2.0 — génération d'images via Krea 2 (api.krea.ai, backend /api/image/*).
// Composer + presets de format + galerie globale + envoi vers un projet.
// Les erreurs API (dont « solde à recharger », 402) remontent en toast via api.ts.
import { useCallback, useEffect, useState } from "react";
import { Copy, Download, FolderInput, Image as ImageIcon, Sparkles } from "lucide-react";
import { api } from "../api";
import { useAppState } from "../state/AppState";
import { Button, Chip, Badge, EmptyState, Modal, Textarea, cx, TEXT } from "../design";

const FORMATS = [
  { id: "1:1",  label: "Carré",        resolution: "1K" },
  { id: "3:2",  label: "Paysage",      resolution: "1K" },
  { id: "2:3",  label: "Portrait",     resolution: "1K" },
  { id: "16:9", label: "Large",        resolution: "1K" },
  { id: "1:1-2k", label: "Carré 2K",   aspect: "1:1", resolution: "2K" },
];

export default function ImageCreatorPane() {
  const { pushToast } = useAppState();
  const [prompt, setPrompt] = useState("");
  const [format, setFormat] = useState(FORMATS[0]);
  const [busy, setBusy] = useState(false);
  const [images, setImages] = useState([]);
  const [viewer, setViewer] = useState(null); // image ouverte en grand
  const [projects, setProjects] = useState([]);
  const [sendTarget, setSendTarget] = useState("");

  const refresh = useCallback(() => {
    api("/api/image/list").then((d) => setImages(d.images ?? [])).catch(() => {});
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    api("/api/projects").then((d) => setProjects(d.projects ?? [])).catch(() => {});
  }, []);

  const generate = async () => {
    const p = prompt.trim();
    if (!p || busy) return;
    setBusy(true);
    try {
      await api("/api/image/generate", {
        method: "POST",
        body: { prompt: p, aspectRatio: format.aspect ?? format.id, resolution: format.resolution },
      });
      setPrompt("");
      refresh();
      pushToast("ok", "Image générée 🥭");
    } catch {
      /* onApiError a déjà affiché le toast (dont « solde à recharger ») */
    } finally {
      setBusy(false);
    }
  };

  const sendToProject = async (name, project) => {
    if (!project) return;
    try {
      const d = await api("/api/image/send-to-project", { method: "POST", body: { name, project } });
      pushToast("ok", `Copiée dans ${project} — utilisable via ${d.url}`);
    } catch { /* toast global */ }
  };

  const copyUrl = (name) => {
    navigator.clipboard?.writeText(`${location.origin}/api/image/file/${name}`)
      .then(() => pushToast("ok", "URL copiée"))
      .catch(() => pushToast("error", "Copie impossible"));
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Composer */}
      <div className="shrink-0 border-b border-edge-soft px-6 py-4">
        <div className="mx-auto w-full max-w-[860px]">
          <div className="rounded-2xl border border-edge bg-raised p-3 transition-colors duration-150 focus-within:border-faint">
            <Textarea
              rows={2}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); generate(); } }}
              placeholder="Décris l'image (en anglais de préférence) — sujet, style, lumière, ambiance…"
              className="border-0 bg-transparent px-1.5 text-[14px] focus:border-0"
            />
            <div className="flex flex-wrap items-center gap-1.5 pt-2">
              {FORMATS.map((f) => (
                <Chip key={f.id} selected={format.id === f.id} onClick={() => setFormat(f)}>{f.label}</Chip>
              ))}
              <Badge tone="accent" className="ml-2">Krea 2</Badge>
              <Button
                variant="primary"
                className="ml-auto"
                icon={<Sparkles size={14} />}
                loading={busy}
                disabled={!prompt.trim()}
                onClick={generate}
              >
                {busy ? "Génération…" : "Générer"}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Galerie */}
      <div className="nice-scroll min-h-0 flex-1 overflow-y-auto px-6 py-5">
        <div className="mx-auto w-full max-w-[860px]">
          {images.length === 0 ? (
            <EmptyState
              icon={<ImageIcon size={30} />}
              title="Aucune image pour l'instant"
              description="Décris ce que tu veux voir et lance la génération — tes créations s'accumulent ici."
            />
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {images.map((img) => (
                <button
                  key={img.name}
                  onClick={() => { setViewer(img); setSendTarget(""); }}
                  className="group overflow-hidden rounded-xl border border-edge-soft bg-panel transition-all duration-150 hover:border-faint focus-visible:outline-2 focus-visible:outline-accent"
                  title={img.name}
                >
                  <img
                    src={`/api/image/file/${img.name}`}
                    alt={img.name}
                    loading="lazy"
                    className="aspect-square w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Visionneuse + actions */}
      <Modal
        open={!!viewer}
        onClose={() => setViewer(null)}
        title={viewer?.name ?? ""}
        widthClass="w-[720px]"
        footer={
          viewer && (
            <>
              <select
                value={sendTarget}
                onChange={(e) => setSendTarget(e.target.value)}
                aria-label="Envoyer vers un projet"
                className={cx(TEXT.sm, "mr-auto rounded-lg border border-edge bg-bg px-2 py-1.5 text-ink outline-none focus:border-faint")}
              >
                <option value="">Envoyer vers un projet…</option>
                {projects.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
              <Button
                variant="secondary"
                size="sm"
                icon={<FolderInput size={13} />}
                disabled={!sendTarget}
                onClick={() => sendToProject(viewer.name, sendTarget)}
              >
                Envoyer
              </Button>
              <Button variant="secondary" size="sm" icon={<Copy size={13} />} onClick={() => copyUrl(viewer.name)}>
                Copier l'URL
              </Button>
              <a href={`/api/image/file/${viewer.name}`} download={viewer.name}>
                <Button variant="primary" size="sm" icon={<Download size={13} />}>Télécharger</Button>
              </a>
            </>
          )
        }
      >
        {viewer && <img src={`/api/image/file/${viewer.name}`} alt={viewer.name} className="w-full rounded-lg" />}
      </Modal>
    </div>
  );
}
