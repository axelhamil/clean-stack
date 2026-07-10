import { describe, expect, it, mock } from "bun:test";

mock.module("../../env", () => ({
  env: { PLATFORM_ADMIN_IDS: ["op-1"], PLATFORM_ADMIN_REQUIRE_MFA: true },
}));

const { requirePlatformAdmin } = await import("../platform-admin.middleware");

function ctx(user: unknown) {
  const store = new Map<string, unknown>([["user", user]]);
  return {
    get: (k: string) => store.get(k),
    set: (k: string, v: unknown) => store.set(k, v),
  } as unknown as Parameters<typeof requirePlatformAdmin>[0];
}

describe("requirePlatformAdmin", () => {
  it("rejects a non-operator with 403", async () => {
    const c = ctx({ id: "user-9", twoFactorEnabled: true });
    await expect(requirePlatformAdmin(c, async () => {})).rejects.toMatchObject({ status: 403 });
  });

  it("rejects an operator without MFA when MFA is required", async () => {
    const c = ctx({ id: "op-1", twoFactorEnabled: false });
    await expect(requirePlatformAdmin(c, async () => {})).rejects.toMatchObject({ status: 403 });
  });

  it("passes an operator with MFA", async () => {
    const c = ctx({ id: "op-1", twoFactorEnabled: true });
    let called = false;
    await requirePlatformAdmin(c, async () => {
      called = true;
    });
    expect(called).toBe(true);
  });
});
