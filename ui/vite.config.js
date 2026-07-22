import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // Accès LAN (demande de Raf, 2026-07-22) : écoute sur toutes les interfaces
    // réseau, pas juste localhost, pour ouvrir l'UI depuis le téléphone sur le
    // même WiFi. Vite affiche l'URL réseau au démarrage. Le proxy /api tourne
    // dans CE process (sur le PC) → il atteint localhost:3000 normalement même
    // quand le navigateur distant parle à l'IP LAN de la machine.
    host: true,
    proxy: {
      "/api": "http://localhost:3000",
    },
  },
  build: {
    rollupOptions: {
      output: {
        // #190 tâche #7 : le bundle principal atteignait 607 kB (warning Vite
        // >500 kB) malgré un large usage de lazy() côté pages — les dépendances
        // partagées (react/react-dom, lucide-react, react-markdown+remark-gfm)
        // restaient hoistées dans le chunk d'entrée. Séparées en chunks vendor
        // dédiés : elles ne re-téléchargent pas à chaque déploiement d'app code
        // (cache navigateur plus efficace) et le chunk d'entrée redescend sous
        // le seuil d'alerte.
        manualChunks: {
          "vendor-react": ["react", "react-dom"],
          "vendor-icons": ["lucide-react"],
          "vendor-markdown": ["react-markdown", "remark-gfm"],
        },
      },
    },
  },
});
