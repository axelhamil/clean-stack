import { defineConfig, mergeConfig } from "vitest/config";
import baseConfig from "./base-vitest.config.js";

export default mergeConfig(baseConfig, defineConfig({}));
