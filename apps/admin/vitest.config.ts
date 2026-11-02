import { resolve } from "node:path";
import baseConfig from "@packages/test/base-vitest.config";
import { defineConfig, mergeConfig } from "vitest/config";

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      globals: true,
      passWithNoTests: true,
      // a11y/ holds Playwright specs; vitest's default glob would collect them and
      // fail on the first test.describe().
      exclude: ["a11y/**"],
    },
    resolve: {
      alias: {
        "@": resolve(__dirname, "./src"),
      },
    },
  }),
);
