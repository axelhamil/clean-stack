import { describe, expect, it } from "bun:test";
import { join } from "node:path";
import { createSourceScan, isRouteFile } from "@packages/test/source-scan";

const apiSrcRoot = join(import.meta.dir, "..");
const scan = createSourceScan(apiSrcRoot);

const ENV_OWNER = "shared/env.ts";

const ALLOWED_ENV_READERS: Record<string, string> = {
  "cron/env.ts":
    "env of the standalone scripts started by the scheduler outside the api process, it cannot import shared/env",
};

const ALLOWED_TX_PARAMETERS: Record<string, string> = {};

const ALLOWED_TRANSACTION_OPENERS: Record<string, string> = {};

function isApiRouteFile(file: string): boolean {
  return file.startsWith("public-api/") || isRouteFile(file);
}

describe("layering rules of the api", () => {
  it("routes never write to the database", () => {
    const routeFiles = [
      ...scan.sourceFiles("health"),
      ...scan.sourceFiles("organization"),
      ...scan.sourceFiles("public-api"),
    ].filter(isApiRouteFile);
    const writes = {
      ...scan.writeCallsPerFile("health"),
      ...scan.writeCallsPerFile("organization"),
      ...scan.writeCallsPerFile("public-api"),
    };

    const writingRoutes = Object.keys(writes).filter(isApiRouteFile);

    expect(routeFiles.length).toBeGreaterThan(0);
    expect(writingRoutes).toEqual([]);
  });

  it("no repository, port or service declares a tx parameter", () => {
    const declared = {
      ...scan.transactionParametersPerFile("auth"),
      ...scan.transactionParametersPerFile("health"),
      ...scan.transactionParametersPerFile("organization"),
      ...scan.transactionParametersPerFile("shared"),
    };

    const strayDeclarations = Object.keys(declared).filter(
      (file) => !(file in ALLOWED_TX_PARAMETERS),
    );
    const staleAllowances = Object.keys(ALLOWED_TX_PARAMETERS).filter(
      (file) => !(file in declared),
    );

    expect(strayDeclarations).toEqual([]);
    expect(staleAllowances).toEqual([]);
  });

  it("db.transaction is called only inside packages/drizzle and scripts", () => {
    const openers = scan.transactionOpenersPerFile(".");

    const strayOpeners = Object.keys(openers).filter(
      (file) => !(file in ALLOWED_TRANSACTION_OPENERS),
    );
    const staleAllowances = Object.keys(ALLOWED_TRANSACTION_OPENERS).filter(
      (file) => !(file in openers),
    );

    expect(strayOpeners).toEqual([]);
    expect(staleAllowances).toEqual([]);
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
