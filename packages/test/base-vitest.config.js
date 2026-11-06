import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: ["node_modules", "dist"],
    environment: "node",
    fsModuleCachePath: resolve(process.cwd(), "node_modules/.vitest-cache"),
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: [
        "node_modules/",
        "dist/",
        "**/*.test.ts",
        "**/*.spec.ts",
        "**/types/**",
        "**/*.d.ts",
      ],
      reporter: ["text", "json", "json-summary", "lcov"],
    },
  },
});
