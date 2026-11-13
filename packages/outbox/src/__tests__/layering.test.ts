import { describe, expect, it } from "bun:test";
import { join } from "node:path";
import { createSourceScan } from "@packages/test/source-scan";

const scan = createSourceScan(join(import.meta.dir, ".."));

describe("layering rules of the outbox kit", () => {
  it("reads no environment, its settings arrive through constructors", () => {
    expect(scan.sourceFiles(".").length).toBeGreaterThan(0);
    expect(scan.envReadsPerFile(".")).toEqual({});
  });

  it("declares no transaction parameter and opens no transaction", () => {
    expect(scan.transactionParametersPerFile(".")).toEqual({});
    expect(scan.transactionOpenersPerFile(".")).toEqual({});
  });
});
