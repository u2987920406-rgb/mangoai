// #140 — Le hub couplé aperçu ↔ chat, extrait du god-component. C'est le cœur
// le plus enchevêtré d'App.jsx : il possède l'URL/clé de l'aperçu, les erreurs
// remontées par l'iframe, et le pont d'inspection (clic sur un élément → seed du
// Chat). Tout cela tient ensemble par UN SEUL listener `message` (inspect-pick
// ET erreurs passent par la même fenêtre postMessage), d'où un hook unique.
//
// Dépendances injectées (pattern des autres hooks) :
//   - screen / projectName : l'effet POST /api/preview ne tire que dans le workspace
//   - pushToast            : retours d'inspection
//   - onRequestFix(prompt) : « Corriger » fabrique un prompt et le pousse au Chat
//                            (le pendingPrompt reste possédé par App, partagé avec openProject)
import { useState, useEffect, useCallback } from "react";
import { SCREENS } from "../nav.js";

export function usePreview({ screen, projectName, pushToast, onRequestFix }) {
  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewKey, setPreviewKey] = useState(0);
  const [previewErrors, setPreviewErrors] = useState([]);
  const [inspecting, setInspecting] = useState(false);
  const [seedInput, setSeedInput] = useState(null);
  const [editTarget, setEditTarget] = useState(null);

  // Entrer dans le workspace (ou changer de projet) démarre/relance l'aperçu Vite.
  useEffect(() => {
    if (screen !== SCREENS.WORKSPACE || !projectName.trim()) return;
    // (Un, 2026-07-03) U6 — anti-réponse périmée : si on change de projet avant
    // que le POST du projet PRÉCÉDENT réponde, sa réponse tardive écrasait
    // l'URL du projet courant (aperçu du mauvais projet). Le cleanup marque
    // l'effet comme périmé → la réponse tardive est ignorée.
    let stale = false;
    fetch(`/api/preview/${encodeURIComponent(projectName)}`, { method: "POST" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (stale) return;
        if (d?.url) {
          setPreviewUrl(d.url);
          setPreviewKey((k) => k + 1);
        }
      })
      .catch(() => {});
    return () => {
      stale = true;
    };
  }, [screen, projectName]);

  // Canal unique iframe → app : inspect-pick (clic sur un élément) et erreurs JS.
  useEffect(() => {
    const onMessage = (e) => {
      const d = e.data;
      if (!d || d.source !== "mangoos-preview") return;
      if (d.type === "inspect-pick") {
        setInspecting(false);
        const label = d.text ? `« ${d.text} »` : `<${d.tag}>`;
        if (d.src) {
          setEditTarget({ src: d.src, tag: d.tag, text: d.text });
          setSeedInput(`Modifie l'élément ${label} (source : ${d.src}) : `);
          pushToast("success", `Élément ciblé : ${d.src}`);
        } else {
          setEditTarget(null);
          setSeedInput(`Modifie l'élément <${d.tag}> ${label} : `);
          pushToast("error", "Élément ciblé (source non tracée — recharge l'aperçu)");
        }
        return;
      }
      if (!d.message) return;
      setPreviewErrors((prev) =>
        prev.includes(d.message) || prev.length >= 10 ? prev : [...prev, d.message],
      );
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [pushToast]);

  // Recharge l'iframe (incrémente la clé de remount).
  const bumpPreview = useCallback(() => setPreviewKey((k) => k + 1), []);
  const clearErrors = useCallback(() => setPreviewErrors([]), []);
  const clearSeed = useCallback(() => setSeedInput(null), []);
  const clearEditTarget = useCallback(() => setEditTarget(null), []);
  const toggleInspect = useCallback(() => setInspecting((v) => !v), []);

  // Changer de projet : on oublie l'URL et les erreurs du projet précédent.
  // (L'inspection/seed se vident naturellement à la consommation côté Chat.)
  const resetForProject = useCallback(() => {
    setPreviewUrl(null);
    setPreviewErrors([]);
  }, []);

  // « Corriger les erreurs » : fabrique un prompt depuis les erreurs courantes,
  // le pousse au Chat (via onRequestFix), puis vide la pile.
  const requestFix = useCallback(() => {
    if (previewErrors.length === 0) return;
    const list = previewErrors.map((er) => `- ${er}`).join("\n");
    onRequestFix?.(`Corrige ces erreurs détectées dans l'aperçu de l'app :\n${list}`);
    setPreviewErrors([]);
  }, [previewErrors, onRequestFix]);

  return {
    previewUrl,
    setPreviewUrl,
    previewKey,
    bumpPreview,
    previewErrors,
    clearErrors,
    inspecting,
    toggleInspect,
    seedInput,
    setSeedInput,
    clearSeed,
    editTarget,
    clearEditTarget,
    requestFix,
    resetForProject,
  };
}
