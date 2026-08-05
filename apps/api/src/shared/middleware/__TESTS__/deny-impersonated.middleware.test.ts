import { describe, expect, it } from "bun:test";
import { denyImpersonated } from "../deny-impersonated.middleware";

function ctx(session: unknown) {
  const store = new Map<string, unknown>([["session", session]]);
  return {
    get: (k: string) => store.get(k),
    set: (k: string, v: unknown) => store.set(k, v),
  } as unknown as Parameters<typeof denyImpersonated>[0];
}

describe("denyImpersonated", () => {
  it("rejects a request made from an impersonated session", async () => {
    const c = ctx({ id: "s-1", impersonatedBy: "admin-1" });
    await expect(denyImpersonated(c, async () => {})).rejects.toMatchObject({ status: 403 });
  });

  it("passes a regular session through", async () => {
    const c = ctx({ id: "s-1", impersonatedBy: null });
    let called = false;
    await denyImpersonated(c, async () => {
      called = true;
    });
    expect(called).toBe(true);
  });
});
