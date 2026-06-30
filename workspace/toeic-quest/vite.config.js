import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
