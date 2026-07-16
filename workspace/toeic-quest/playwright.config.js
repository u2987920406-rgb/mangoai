// ─── Playwright — tests e2e du parcours Yes I Can Toeic ──────────────────────
// Le serveur de test est le PREVIEW Vite (build de production), reconstruit
// automatiquement avant la campagne. `npm run test:e2e` suffit.
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:4188",
  },
  // Deux profils : le parcours historique en Desktop Chrome (viewport fixe
  // 1280×800, comportement inchangé) + un profil mobile réel (Pixel 7) — la
  // suite tournait jusqu'ici exclusivement desktop malgré le wrap Capacitor visé.
  projects: [
    {
      name: "desktop-chrome",
      use: { viewport: { width: 1280, height: 800 }, ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-pixel7",
      use: { ...devices["Pixel 7"] },
    },
  ],
  webServer: {
    command: "npm run build && npm run preview -- --port 4188 --strictPort",
    url: "http://localhost:4188",
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
