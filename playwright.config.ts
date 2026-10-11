import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  reporter: "list",
  timeout: 30000,
  outputDir: "tests/.results",
  use: { baseURL: "http://localhost:4173", viewport: { width: 1440, height: 900 } },
  webServer: { command: "npm run build && npx vite preview --port 4173 --strictPort", port: 4173, reuseExistingServer: true },
});
