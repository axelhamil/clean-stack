import { describe, expect, it } from "bun:test";
import { join } from "node:path";
import { createSourceScan } from "@packages/test/source-scan";

const scan = createSourceScan(join(import.meta.dir, ".."));

describe("layering rules of the http kit", () => {
  it("reads no environment and writes only through the sweep purge", () => {
    expect(scan.sourceFiles(".").length).toBeGreaterThan(0);
    expect(scan.envReadsPerFile(".")).toEqual({});
    expect(scan.writeCallsPerFile(".")).toEqual({ "sweep-purge.ts": 1 });
  });
});
