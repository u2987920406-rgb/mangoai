import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["fonts/*", "assets/icons/*.png"],
      manifest: {
        name: "Yes I Can Toeic",
        short_name: "Yes I Can Toeic",
        description: "Prépare ton TOEIC en t'amusant — parcours de 52 semaines, 7 parties officielles, vers le score 800+.",
        theme_color: "#ff6f57",
        background_color: "#ffffff",
        display: "standalone",
        start_url: "/",
        scope: "/",
        lang: "fr",
        icons: [
          { src: "assets/icons/icon-48.png", type: "image/png", sizes: "48x48", purpose: "any maskable" },
          { src: "assets/icons/icon-72.png", type: "image/png", sizes: "72x72", purpose: "any maskable" },
          { src: "assets/icons/icon-96.png", type: "image/png", sizes: "96x96", purpose: "any maskable" },
          { src: "assets/icons/icon-128.png", type: "image/png", sizes: "128x128", purpose: "any maskable" },
          { src: "assets/icons/icon-192.png", type: "image/png", sizes: "192x192", purpose: "any maskable" },
          { src: "assets/icons/icon-256.png", type: "image/png", sizes: "256x256", purpose: "any maskable" },
          { src: "assets/icons/icon-512.png", type: "image/png", sizes: "512x512", purpose: "any maskable" },
        ],
      },
      workbox: {
        // Le shell (JS/CSS/HTML/polices) est précaché à l'install ; les 435+
        // photos Pexels locales (60+ Mo) seraient trop lourdes à précacher
        // d'un coup — mises en cache à l'usage (CacheFirst) à la place.
        globPatterns: ["**/*.{js,css,html,woff2}"],
        runtimeCaching: [
          {
            urlPattern: /\/assets\/pexels\/.*\.jpeg$/,
            handler: "CacheFirst",
            options: {
              cacheName: "toeic-images",
              expiration: { maxEntries: 600, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
    }),
  ],
  server: {
    // The builder UI embeds this app in an iframe from another origin (localhost:5173)
    cors: true,
  },
  build: {
    rollupOptions: {
      output: {
        // Code-splitting : isole le runtime React et la banque de questions
        // (gros volume de texte) du code applicatif → caching + parallélisation.
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("react")) return "react-vendor";
            return "vendor";
          }
          if (id.includes("/data/bank/") || id.includes("/data/curriculum")) return "content";
        },
      },
    },
  },
});
