// #140 — Système de toasts extrait du god-component App.jsx.
// Auto-contenu : état + compteur d'id stable + auto-dismiss après 8 s. Rendu via
// <Toasts toasts={toasts} onDismiss={dismissToast} />.
import { useState, useRef, useCallback } from "react";

export function useToasts() {
  const [toasts, setToasts] = useState([]);
  const toastId = useRef(1);

  const dismissToast = useCallback(
    (id) => setToasts((prev) => prev.filter((t) => t.id !== id)),
    [],
  );

  const pushToast = useCallback(
    (kind, text, linkUrl) => {
      const id = toastId.current++;
      setToasts((prev) => [...prev, { id, kind, text, linkUrl }]);
      setTimeout(() => dismissToast(id), 8000);
    },
    [dismissToast],
  );

  return { toasts, pushToast, dismissToast };
}
