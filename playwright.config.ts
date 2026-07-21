import { defineConfig, devices } from "@playwright/test";

// E2E berjalan terhadap dev server (bun run dev) yang tersambung ke Supabase
// terkelola (DB live). Karena itu:
//  - workers: 1 & fullyParallel: false → hindari balapan data di DB.
//  - test membuat data uji berprefiks "E2E-" lalu membersihkannya sendiri.
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:8080",
    trace: "on-first-retry",
    actionTimeout: 15_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "bun run dev",
    url: "http://localhost:8080",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
