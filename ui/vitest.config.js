// #140 (point #4) — config de test UI. Séparée de `vite build` (qui tourne sur
// les défauts esbuild) : ce fichier n'est lu que par Vitest. Environnement jsdom
// pour les hooks/composants React (window, timers, addEventListener), plugin
// React pour le JSX des futurs tests de composants, et les matchers jest-dom.
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test-setup.js"],
  },
});
