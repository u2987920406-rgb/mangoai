import { useEffect, useRef, useState } from "react";

// Snap mode: the user draws a rectangle over the preview; the backend
// re-renders the preview at the iframe's exact size and crops that zone.
// Extrait de Chat.jsx sans changement de comportement.
export function useSnapCapture({ projectName, push, addFiles }) {
  const [snapMode, setSnapMode] = useState(false);
  const [snapBusy, setSnapBusy] = useState(false);
  const [snapRect, setSnapRect] = useState(null); // {x, y, w, h} viewport coords
  const snapStart = useRef(null);

  useEffect(() => {
    if (!snapMode) return;
    const onKey = (e) => e.key === "Escape" && cancelSnap();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapMode]);

  const cancelSnap = () => {
    setSnapMode(false);
    setSnapRect(null);
    snapStart.current = null;
  };

  async function finishSnap() {
    const rect = snapRect;
    cancelSnap();
    if (!rect || rect.w < 8 || rect.h < 8) return;
    const iframe = document.querySelector("iframe");
    if (!iframe) {
      push({ role: "status", text: "Aucun aperçu à capturer — lance d'abord l'app." });
      return;
    }
    // Intersect the drawn rectangle with the preview iframe
    const r = iframe.getBoundingClientRect();
    const x1 = Math.max(rect.x, r.left);
    const y1 = Math.max(rect.y, r.top);
    const x2 = Math.min(rect.x + rect.w, r.right);
    const y2 = Math.min(rect.y + rect.h, r.bottom);
    if (x2 - x1 < 8 || y2 - y1 < 8) {
      push({ role: "status", text: "La zone capturée doit recouvrir l'aperçu (panneau de droite)." });
      return;
    }
    setSnapBusy(true);
    try {
      const res = await fetch("/api/snap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectName,
          viewport: { width: Math.round(r.width), height: Math.round(r.height) },
          box: {
            x: Math.round(x1 - r.left),
            y: Math.round(y1 - r.top),
            width: Math.round(x2 - x1),
            height: Math.round(y2 - y1),
          },
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? `Erreur HTTP ${res.status}`);
      const bytes = Uint8Array.from(atob(d.data), (c) => c.charCodeAt(0));
      addFiles([new File([bytes], "capture-zone.png", { type: "image/png" })]);
    } catch (err) {
      push({ role: "error", text: `Capture impossible : ${err.message ?? err}` });
    } finally {
      setSnapBusy(false);
    }
  }

  return { snapMode, setSnapMode, snapBusy, snapRect, setSnapRect, snapStart, cancelSnap, finishSnap };
}
