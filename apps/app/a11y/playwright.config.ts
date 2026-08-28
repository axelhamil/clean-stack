import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

const BASE_URL = process.env.A11Y_BASE_URL ?? "http://localhost:4173";
const APP_ROOT = fileURLToPath(new URL("..", import.meta.url));

export const STORAGE_STATE = fileURLToPath(new URL(".auth/state.json", import.meta.url));

export default defineConfig({
  testDir: fileURLToPath(new URL(".", import.meta.url)),
  fullyParallel: true,
  // Every authenticated-page test shares one seeded identity (`auth.setup.ts`),
  // and the API's global rate limit is keyed per-user (60 req/min), not per
  // browser context — so a high worker count turns "N pages loading in
  // parallel" into "N pages' worth of requests landing in one shared bucket
  // within the same second". `/settings/sso` alone fires ~5 queries per load
  // (providers, domain verification token, SCIM connections, entitlements),
  // so it's the first page to trip that ceiling once enough pages queue up
  // behind it. Capped low and fixed (not `50%` of the host's core count,
  // Playwright's own default) so the burst never gets close to the ceiling on
  // any machine — verified serially at `workers: 1` (20/20 pass, ~19s) before
  // landing on this number, which keeps a meaningful amount of parallelism
  // without reintroducing the flake.
  workers: 4,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts$/ },
    {
      name: "audit",
      testMatch: /\.spec\.ts$/,
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "pnpm preview --port 4173 --strictPort",
    cwd: APP_ROOT,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
