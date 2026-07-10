// ─── Playwright — tests e2e du parcours TOEIC Quest ──────────────────────────
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
    viewport: { width: 1280, height: 800 },
    ...devices["Desktop Chrome"],
  },
  webServer: {
    command: "npm run build && npm run preview -- --port 4188 --strictPort",
    url: "http://localhost:4188",
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
