import { describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

describe("listFrontConsumers case-insensitive __tests__ exclusion", () => {
  it("ignores a non-.test file dropped in a lowercase __tests__ dir", () => {
    const root = mkdtempSync(join(tmpdir(), "front-consumers-"));
    const testsDir = join(root, "__tests__");
    mkdirSync(testsDir);
    writeFileSync(join(testsDir, "fixture.ts"), "api.uploads.presign.$post();\n");

    expect(listFrontConsumers(root)).toEqual([]);

    rmSync(root, { recursive: true, force: true });
  });
});
