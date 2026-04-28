import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/schema/index.ts"],
  format: ["esm"],
  dts: {
    compilerOptions: {
      incremental: false,
      ignoreDeprecations: "6.0",
    },
  },
  clean: true,
  sourcemap: true,
});
