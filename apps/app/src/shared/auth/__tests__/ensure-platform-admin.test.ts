import { describe, expect, it, vi } from "vitest";
import { ensurePlatformAdmin } from "../ensure-platform-admin";

function ctx(isPlatformAdmin: boolean | undefined) {
  return {
    context: {
      queryClient: { ensureQueryData: vi.fn(async () => ({ user: { isPlatformAdmin } })) },
    },
  } as never;
}

describe("ensurePlatformAdmin", () => {
  it("throws a redirect when the user is not a platform admin", async () => {
    await expect(ensurePlatformAdmin(ctx(false))).rejects.toBeTruthy();
  });
  it("passes a platform admin", async () => {
    await expect(ensurePlatformAdmin(ctx(true))).resolves.toBeUndefined();
  });
});
