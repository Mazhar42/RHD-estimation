import { defineConfig, devices } from "@playwright/test";

// E2E tests drive a real browser against a real running frontend+backend
// (see e2e/README.md for how to start both locally). Not wired into CI
// yet -- that needs a way to stand up the backend + a throwaway DB in the
// pipeline first.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  globalSetup: "./e2e/global-setup.js",
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:5173",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
