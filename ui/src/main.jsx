import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";

// Maquette shell 2.0 (audit-mango-2.0, Phase B1) : gelée le 2026-07-09 (audit UI).
// Le routage ?v2 vers src/v2/ShellV2.jsx a été retiré ici — l'UI actuelle (App.jsx)
// est la seule shell de prod. Les fichiers src/v2/ restent sur disque, non référencés,
// à supprimer ou promouvoir ultérieurement.

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
