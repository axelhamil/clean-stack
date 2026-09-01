import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    passWithNoTests: true,
    // a11y/ holds Playwright specs; vitest's default glob would collect them and
    // fail on the first test.describe().
    exclude: ["**/node_modules/**", "**/dist/**", "a11y/**"],
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
});
