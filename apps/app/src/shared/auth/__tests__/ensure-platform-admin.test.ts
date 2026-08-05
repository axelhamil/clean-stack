import { describe, expect, it, vi } from "vitest";
import { ensurePlatformAdmin } from "../ensure-platform-admin";

function ctx(user: { isPlatformAdmin: boolean | undefined; twoFactorEnabled?: boolean }) {
  return {
    context: {
      queryClient: { ensureQueryData: vi.fn(async () => ({ user })) },
    },
  } as never;
}

describe("ensurePlatformAdmin", () => {
  it("throws a redirect when the user is not a platform admin", async () => {
    await expect(ensurePlatformAdmin(ctx({ isPlatformAdmin: false }))).rejects.toBeTruthy();
  });

  it("throws a redirect when isPlatformAdmin but twoFactorEnabled is false", async () => {
    await expect(
      ensurePlatformAdmin(ctx({ isPlatformAdmin: true, twoFactorEnabled: false })),
    ).rejects.toBeTruthy();
  });

  it("throws a redirect when isPlatformAdmin but twoFactorEnabled is absent", async () => {
    await expect(
      ensurePlatformAdmin(ctx({ isPlatformAdmin: true, twoFactorEnabled: undefined })),
    ).rejects.toBeTruthy();
  });

  it("resolves for a platform admin with MFA enabled", async () => {
    await expect(
      ensurePlatformAdmin(ctx({ isPlatformAdmin: true, twoFactorEnabled: true })),
    ).resolves.toBeUndefined();
  });
});
