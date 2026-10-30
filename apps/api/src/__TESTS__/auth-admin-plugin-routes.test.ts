import { describe, expect, it } from "bun:test";
import { routes } from "../app";

describe("the auth plugin's own admin routes", () => {
  it("are answered before the auth handler, so its role check cannot bypass staff permissions", () => {
    const paths = routes.routes.filter((r) => r.method === "POST").map((r) => r.path);
    const blocked = paths.indexOf("/api/auth/admin/*");

    expect(blocked).toBeGreaterThanOrEqual(0);
    expect(blocked).toBeLessThan(paths.indexOf("/api/auth/*"));
  });
});
