// Métadonnées de catégorie partagées du panneau Multi-projets — extraites
// verbatim de MultiProject.jsx (découpage UI sans changement de comportement).
export const CATEGORY_META = {
  component: { label: "composant", className: "bg-purple-500/15 text-purple-300" },
  hook:      { label: "hook",      className: "bg-blue-500/15 text-blue-300" },
  util:      { label: "utilitaire",className: "bg-teal-500/15 text-teal-300" },
  service:   { label: "service",   className: "bg-orange-500/15 text-orange-300" },
  type:      { label: "type",      className: "bg-yellow-500/15 text-yellow-300" },
  other:     { label: "autre",     className: "bg-zinc-500/15 text-zinc-400" },
};

export const ALL_CATEGORIES = Object.keys(CATEGORY_META);
