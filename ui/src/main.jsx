import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import ShellV2 from "./v2/ShellV2.jsx";
import "./index.css";

// Maquette shell 2.0 (audit-mango-2.0, Phase B1) : http://localhost:5173/?v2
// L'UI actuelle reste l'entrée par défaut — zéro impact hors du paramètre.
const isV2 = new URLSearchParams(window.location.search).has("v2");

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {isV2 ? <ShellV2 /> : <App />}
  </React.StrictMode>,
);
