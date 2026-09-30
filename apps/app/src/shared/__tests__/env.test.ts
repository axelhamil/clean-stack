import { afterEach, describe, expect, it, vi } from "vitest";

async function loadEnv() {
  vi.resetModules();
  return (await import("../env")).env;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("env", () => {
  // `.env.example` ships these keys blank. Read as "", the Sentry environment
  // was "" instead of falling back to the build mode, and the release was "".
  it("treats every blank optional key as absent", async () => {
    for (const key of [
      "VITE_SENTRY_DSN",
      "VITE_SENTRY_ENVIRONMENT",
      "VITE_GIT_SHA",
      "VITE_ANALYTICS_SRC",
      "VITE_STRIPE_PUBLISHABLE_KEY",
    ]) {
      vi.stubEnv(key, "");
    }

    const env = await loadEnv();

    expect(env.VITE_SENTRY_DSN).toBeUndefined();
    expect(env.VITE_SENTRY_ENVIRONMENT).toBeUndefined();
    expect(env.VITE_GIT_SHA).toBeUndefined();
    expect(env.VITE_ANALYTICS_SRC).toBeUndefined();
    expect(env.VITE_STRIPE_PUBLISHABLE_KEY).toBeUndefined();
  });

  it("keeps a set value", async () => {
    vi.stubEnv("VITE_SENTRY_ENVIRONMENT", "staging");

    expect((await loadEnv()).VITE_SENTRY_ENVIRONMENT).toBe("staging");
  });

  it("still rejects a malformed url", async () => {
    vi.stubEnv("VITE_SENTRY_DSN", "not a url");

    await expect(loadEnv()).rejects.toThrow();
  });
});
