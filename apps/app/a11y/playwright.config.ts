import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

const BASE_URL = process.env.A11Y_BASE_URL ?? "http://localhost:4173";
const APP_ROOT = fileURLToPath(new URL("..", import.meta.url));

export const STORAGE_STATE = fileURLToPath(new URL(".auth/state.json", import.meta.url));

export default defineConfig({
  testDir: fileURLToPath(new URL(".", import.meta.url)),
  fullyParallel: true,
  // `workers` is a courtesy cap on machine load, NOT what keeps the API's global
  // rate limit off this suite — an earlier comment here claimed otherwise and was
  // wrong. The bucket this sweep fills is the IP-keyed one (`global:<ip>`), not the
  // per-user one: `sessionMiddleware` nulls the user for `/api/auth/*`, so a
  // signed-in page's session and organization queries land on the IP alongside every
  // unauthenticated page load. A full sweep measured 61 requests in that bucket
  // against a then-60/min ceiling — one over, deterministically — while the per-user
  // bucket sat at 39. Worker count does not bound either: the ceiling is per minute
  // over the whole run, and the IP is the same from every worker. The fix was to
  // tune the API's burst window to what a page view actually costs
  // (`GLOBAL_POLICY`, apps/api/src/shared/middleware/rate-limit.policies.ts); this
  // number just keeps the host from being swamped.
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
