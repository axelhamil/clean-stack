import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs", "esm"],
  dts: {
    compilerOptions: {
      incremental: false,
      ignoreDeprecations: "6.0",
    },
  },
  clean: true,
  sourcemap: true,
  treeshake: true,
  minify: false,
});
