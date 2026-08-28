import { resolve } from "node:path";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN;
const sentryOrg = process.env.SENTRY_ORG;
const sentryProject = process.env.SENTRY_PROJECT;
const release = process.env.VITE_GIT_SHA;

export default defineConfig({
  plugins: [
    tanstackRouter({
      target: "react",
      routesDirectory: "./src",
      generatedRouteTree: "./src/routeTree.gen.ts",
      virtualRouteConfig: "./routes.ts",
      autoCodeSplitting: true,
    }),
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
  server: {
    port: 5173,
    headers: {
      // HMR injects scripts/styles inline — enforce is impractical in dev; exercises the report endpoint
      "Content-Security-Policy-Report-Only":
        "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob:; connect-src 'self' ws: wss: http://localhost:3000; report-uri http://localhost:3000/csp-report",
    },
  },
  build: { chunkSizeWarningLimit: 700, sourcemap: "hidden" },
  html: { cspNonce: "{{placeholder `http.request.uuid`}}" },
});
