import { describe, expect, it } from "bun:test";
import { extractRouteFromChain, listFrontConsumers } from "../front-consumers";

describe("extractRouteFromChain", () => {
  it("converts a dotted chain into a route key", () => {
    expect(extractRouteFromChain("api.uploads.presign.$post")).toBe("POST /uploads/presign");
  });

  it("handles bracketed kebab-case and param segments", () => {
    expect(extractRouteFromChain('api.admin.users[":id"]["reset-password"].$post')).toBe(
      "POST /admin/users/:id/reset-password",
    );
  });

  it("maps a root-level call to the mount path itself", () => {
    expect(extractRouteFromChain("api.uploads.$delete")).toBe("DELETE /uploads");
  });

  it("upper-cases the method", () => {
    expect(extractRouteFromChain("api.notifications.$get")).toBe("GET /notifications");
  });
});

describe("listFrontConsumers", () => {
  it("finds every call site in apps/app and attributes it to its file", () => {
    const consumers = listFrontConsumers();
    expect(consumers.length).toBeGreaterThan(30);

    const presign = consumers.find((c) => c.route === "POST /uploads/presign");
    expect(presign?.file).toBe("apps/app/src/shared/api/mutations/create-upload.ts");
  });
});
