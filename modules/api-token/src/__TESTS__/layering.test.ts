import { describe, it } from "bun:test";
import { join } from "node:path";
import { assertModuleLayering } from "@packages/test/source-scan";

describe("layering rules of the api-token module", () => {
  it("keeps every layer guard of a module", () => {
    assertModuleLayering(join(import.meta.dir, ".."));
  });
});
