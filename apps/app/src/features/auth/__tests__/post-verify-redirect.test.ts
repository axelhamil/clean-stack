import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rememberPostVerifyRedirect, takePostVerifyRedirect } from "../post-verify-redirect";

function memoryStorage() {
  const entries = new Map<string, string>();
  return {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => void entries.set(key, value),
    removeItem: (key: string) => void entries.delete(key),
    entries,
  };
}

describe("post-verify redirect", () => {
  let storage: ReturnType<typeof memoryStorage>;

  beforeEach(() => {
    storage = memoryStorage();
    vi.stubGlobal("localStorage", storage);
  });

  afterEach(() => vi.unstubAllGlobals());

  it("given a sign-up from an invitation, when the email is verified, then the invitation is the destination, once", () => {
    rememberPostVerifyRedirect("/accept-invitation/inv_1");

    expect(takePostVerifyRedirect()).toBe("/accept-invitation/inv_1");
    expect(takePostVerifyRedirect()).toBeUndefined();
  });

  it("given a later sign-up without a destination, when verified, then an older destination is not reused", () => {
    rememberPostVerifyRedirect("/accept-invitation/inv_1");
    rememberPostVerifyRedirect(undefined);

    expect(takePostVerifyRedirect()).toBeUndefined();
  });

  it("given a tampered stored value, when verified, then it is not followed", () => {
    rememberPostVerifyRedirect("/dashboard");
    for (const key of storage.entries.keys()) storage.entries.set(key, "//evil.example");

    expect(takePostVerifyRedirect()).toBeUndefined();
  });

  it("given blocked storage, when signing up and verifying, then the flow still completes", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    });

    expect(() => rememberPostVerifyRedirect("/dashboard")).not.toThrow();
    expect(takePostVerifyRedirect()).toBeUndefined();
  });
});
