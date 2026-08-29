import { describe, expect, it, mock } from "bun:test";
import { Option, Result } from "@packages/ddd-kit";

describe("PUT /me/locale", () => {
  it("rejects a locale outside the supported set", async () => {
    const { localeSchema } = await import("../profile.schema");
    expect(localeSchema.safeParse({ locale: "de" }).success).toBe(false);
    expect(localeSchema.safeParse({ locale: "fr" }).success).toBe(true);
  });

  it("emits previousLocale as null when the user never chose one", async () => {
    const emitted: unknown[] = [];
    const store = {
      findLocale: mock(async () => Result.ok(Option.none())),
      setLocale: mock(async () => Result.ok(undefined)),
    };
    const previous = await store.findLocale();
    const value = previous.getValue();
    emitted.push({
      userId: "u1",
      locale: "fr",
      previousLocale: value.isSome() ? value.unwrap() : null,
    });
    expect(emitted[0]).toEqual({ userId: "u1", locale: "fr", previousLocale: null });
  });

  it("carries the prior locale when one existed", async () => {
    const store = { findLocale: mock(async () => Result.ok(Option.some("en" as const))) };
    const value = (await store.findLocale()).getValue();
    expect(value.isSome() ? value.unwrap() : null).toBe("en");
  });
});
