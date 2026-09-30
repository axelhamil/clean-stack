import { describe, expect, it, vi } from "vitest";

const put = vi.fn();

vi.mock("../../api-client", () => ({
  api: { me: { locale: { $put: (...args: unknown[]) => put(...args) } } },
}));

import { isUnexpectedMutationError } from "../../../observability/error-classifier";
import { setLocaleMutationOptions } from "../set-locale";

type SetLocaleFn = (input: { locale: "en" | "fr" }) => Promise<unknown>;

const setLocale = setLocaleMutationOptions.mutationFn as SetLocaleFn;

describe("setLocaleMutationOptions", () => {
  // It used to throw the raw JSON body: no `status`, so a rate-limited save
  // skipped the rate-limit toast and reached telemetry as an unexpected error.
  it("rejects with an ApiError that keeps the status and the code", async () => {
    put.mockResolvedValue(
      new Response(
        JSON.stringify({ error: { code: "SECURITY_RATE_LIMITED", message: "slow down" } }),
        { status: 429, headers: { "Content-Type": "application/json" } },
      ),
    );

    const err = await setLocale({ locale: "fr" }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(Error);
    expect(err).toMatchObject({ status: 429, code: "SECURITY_RATE_LIMITED" });
    expect(isUnexpectedMutationError(err)).toBe(false);
  });

  it("returns the body on success", async () => {
    put.mockResolvedValue(new Response(JSON.stringify({ locale: "fr" }), { status: 200 }));

    expect(await setLocale({ locale: "fr" })).toEqual({ locale: "fr" });
  });
});
