import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import RuntimeStatus from "./components/RuntimeStatus.jsx";
import "./index.css";

// Maquette shell 2.0 (audit-mango-2.0, Phase B1) : gelée le 2026-07-09, `src/v2/`
// supprimé le 2026-07-22 (limites.md L137 — restait un angle mort où un composant
// pouvait être construit/testé sans jamais être monté par la vraie app, comme
// CodePane.jsx l'a été le temps d'un chantier avant d'être porté ici). App.jsx
// reste la seule shell de prod.

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
    <RuntimeStatus />
  </React.StrictMode>,
);
