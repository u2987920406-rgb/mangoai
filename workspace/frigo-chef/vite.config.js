import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // The builder UI embeds this app in an iframe from another origin (localhost:5173)
    cors: true,
  },
});
