import { resolve } from "node:path";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN;
const sentryOrg = process.env.SENTRY_ORG;
const sentryProject = process.env.SENTRY_PROJECT;
const release = process.env.VITE_GIT_SHA;

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    sentryAuthToken && sentryOrg && sentryProject
      ? sentryVitePlugin({
          authToken: sentryAuthToken,
          org: sentryOrg,
          project: sentryProject,
          release: release ? { name: release } : undefined,
          sourcemaps: { filesToDeleteAfterUpload: ["dist/**/*.map"] },
        })
      : undefined,
  ].filter(Boolean),
  resolve: {
    alias: { "@": resolve(__dirname, "./src") },
    dedupe: ["react", "react-dom"],
  },
  optimizeDeps: {
    include: ["react", "react-dom", "react-dom/client", "react/jsx-runtime"],
  },
  server: { port: 5173 },
  build: { chunkSizeWarningLimit: 700, sourcemap: "hidden" },
});
