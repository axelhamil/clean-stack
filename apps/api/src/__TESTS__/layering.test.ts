import { describe, expect, it } from "bun:test";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createSourceScan } from "@packages/test/source-scan";

const apiSrcRoot = join(import.meta.dir, "..");
const scan = createSourceScan(apiSrcRoot);

const ENV_OWNER = "shared/env.ts";

const ALLOWED_ENV_READERS: Record<string, string> = {
  "cron/sweep.ts":
    "standalone script started by the scheduler outside the api process, it cannot import shared/env",
};

const modules = readdirSync(join(apiSrcRoot, "modules"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => `modules/${entry.name}`);

function layersNamed(name: string): string[] {
  return modules
    .map((module) => `${module}/${name}`)
    .filter((layer) => existsSync(join(apiSrcRoot, layer)));
}

function isRouteFile(file: string): boolean {
  const name = file.split("/").at(-1) ?? "";

  return file.startsWith("public-api/") || name === "routes.ts" || name.endsWith(".routes.ts");
}

describe("layering rules of the api", () => {
  it("domain and application never throw", () => {
    const layers = [...layersNamed("domain"), ...layersNamed("application")];

    const throws = Object.assign({}, ...layers.map((layer) => scan.throwsPerFile(layer)));

    expect(layers.length).toBeGreaterThan(0);
    expect(throws).toEqual({});
  });

  it("routes never write to the database", () => {
    const routeFiles = [...scan.sourceFiles("modules"), ...scan.sourceFiles("public-api")].filter(
      isRouteFile,
    );
    const writes = {
      ...scan.writeCallsPerFile("modules"),
      ...scan.writeCallsPerFile("public-api"),
    };

    const writingRoutes = Object.keys(writes).filter(isRouteFile);

    expect(routeFiles.length).toBeGreaterThan(0);
    expect(writingRoutes).toEqual([]);
  });

  it("environment is read only through shared/env", () => {
    const allReads = scan.envReadsPerFile(".");

    const strayReaders = Object.keys(allReads).filter(
      (file) => file !== ENV_OWNER && !(file in ALLOWED_ENV_READERS),
    );
    const staleAllowances = Object.keys(ALLOWED_ENV_READERS).filter((file) => !(file in allReads));

    expect(allReads[ENV_OWNER]).toBeGreaterThan(0);
    expect(strayReaders).toEqual([]);
    expect(staleAllowances).toEqual([]);
  });
});
