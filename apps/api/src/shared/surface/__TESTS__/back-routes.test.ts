import { describe, expect, it } from "bun:test";

describe("app module", () => {
  it("can be imported without booting workers or touching the database", async () => {
    const mod = await import("../../../app");
    expect(Array.isArray(mod.routes.routes)).toBe(true);
    expect(mod.routes.routes.length).toBeGreaterThan(50);
  });
});
