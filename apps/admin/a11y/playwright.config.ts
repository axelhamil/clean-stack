import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

export const BASE_URL = process.env.A11Y_BASE_URL ?? "http://localhost:4174";
export const APP_URL = process.env.A11Y_APP_URL ?? "http://localhost:4173";

const ADMIN_ROOT = fileURLToPath(new URL("..", import.meta.url));
const APP_ROOT = fileURLToPath(new URL("../../app", import.meta.url));

export const STORAGE_STATE = fileURLToPath(new URL(".auth/state.json", import.meta.url));

export default defineConfig({
  testDir: fileURLToPath(new URL(".", import.meta.url)),
  fullyParallel: true,
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
  webServer: [
    {
      command: "pnpm preview --port 4174 --strictPort",
      cwd: ADMIN_ROOT,
      url: BASE_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: "pnpm preview --port 4173 --strictPort",
      cwd: APP_ROOT,
      url: APP_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
