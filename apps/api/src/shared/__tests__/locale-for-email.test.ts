import { describe, expect, it } from "bun:test";
import type { IGetLocaleByEmailQuery } from "@modules/profile/queries/get-locale-by-email";
import { Option, Result } from "@packages/ddd-kit";
import { DEFAULT_LOCALE } from "@packages/i18n";
import { mockPort } from "@packages/test/bun";
import { localeForEmail } from "../locale-for-user";

describe("localeForEmail", () => {
  it("returns the stored locale", async () => {
    const store = mockPort<IGetLocaleByEmailQuery>();
    store.execute.mockResolvedValue(Result.ok(Option.some("fr")));

    expect(await localeForEmail(store, "ada@example.com")).toBe("fr");
  });

  it("falls back to the default locale when the store fails", async () => {
    const store = mockPort<IGetLocaleByEmailQuery>();
    store.execute.mockResolvedValue(
      Result.fail({ code: "PROFILE_PROVIDER_FAILURE", message: "down" }),
    );

    expect(await localeForEmail(store, "ada@example.com")).toBe(DEFAULT_LOCALE);
  });

  it("falls back to the default locale for an unknown address", async () => {
    const store = mockPort<IGetLocaleByEmailQuery>();
    store.execute.mockResolvedValue(Result.ok(Option.none()));

    expect(await localeForEmail(store, "nobody@example.com")).toBe(DEFAULT_LOCALE);
  });
});
