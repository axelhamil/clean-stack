import baseConfig from "@packages/test/base-vitest.config";
import { defineConfig, mergeConfig } from "vitest/config";

export default mergeConfig(baseConfig, defineConfig({}));
