// Idée #103 — Mango Agent Factory. Constantes partagées.

export const CATEGORY_LABELS = {
  collecteur:   { label: "Collecteur",   desc: "Polling récurrent (API, web, fichiers)", color: "text-blue-400" },
  processeur:   { label: "Processeur",   desc: "Transformation one-shot d'un payload",   color: "text-purple-400" },
  acteur:       { label: "Acteur",       desc: "Agit sur événement (webhook, fichier)",  color: "text-yellow-400" },
  coordinateur: { label: "Coordinateur", desc: "Orchestre d'autres agents via missions",  color: "text-accent" },
};

export const STATUS_STYLES = {
  idle:      { dot: "bg-dim",         label: "En attente" },
  running:   { dot: "bg-ok animate-pulse", label: "En cours" },
  stopped:   { dot: "bg-faint",       label: "Arrêté" },
  error:     { dot: "bg-err",         label: "Erreur" },
  completed: { dot: "bg-blue-400",    label: "Terminé" },
};

export function relativeTime(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return `il y a ${Math.round(diff / 1000)}s`;
  if (diff < 3_600_000) return `il y a ${Math.round(diff / 60_000)}min`;
  return new Date(iso).toLocaleTimeString();
}
