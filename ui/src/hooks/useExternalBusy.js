import { useEffect, useState } from "react";

// Sonde légère de l'état serveur (toutes les 3 s) : tant qu'on ne fait pas NOTRE
// propre tour (busy), on demande si l'agent est occupé ailleurs (session auto de
// Raf, run nocturne) → `externalBusy`. Ainsi l'indicateur de réflexion s'affiche
// AVANT qu'on envoie une requête vouée au 409. Pendant notre tour, c'est `busy`
// qui fait foi (pas besoin de sonder). Best-effort : un échec réseau ne casse rien.
// Extrait de Chat.jsx sans changement de comportement — `setExternalBusy` est
// exposé car send() le force à `true` explicitement sur un 409.
export function useExternalBusy(busy) {
  const [externalBusy, setExternalBusy] = useState(false);
  useEffect(() => {
    if (busy) { setExternalBusy(false); return; }
    let alive = true;
    const tick = () => {
      fetch("/api/agent-status")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (alive) setExternalBusy(Boolean(d?.busy)); })
        .catch(() => {});
    };
    tick();
    const id = setInterval(tick, 3000);
    return () => { alive = false; clearInterval(id); };
  }, [busy]);
  return [externalBusy, setExternalBusy];
}
