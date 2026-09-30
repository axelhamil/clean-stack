import { createI18n, enCatalog } from "@packages/i18n";
import type { TFunction } from "i18next";
import { beforeAll, describe, expect, it } from "vitest";
import { toAuthClientError } from "../../../shared/api/errors/api-error";
import { resolveChangePasswordError } from "../change-password-error";

let tErrors: TFunction<"errors">;

beforeAll(async () => {
  const i18n = await createI18n({ locale: "en", resources: enCatalog });
  tErrors = i18n.getFixedT("en", "errors");
});

describe("resolveChangePasswordError", () => {
  // BetterAuth answers a wrong current password with "Invalid password". The old
  // form matched /incorrect|current/ on that message, missed it, and pinned the
  // error under the *new* password field in raw English.
  it("puts a wrong current password on the current password field, in catalog copy", () => {
    const error = toAuthClientError(
      { code: "INVALID_PASSWORD", status: 400, message: "Invalid password" },
      "fallback",
    );

    expect(resolveChangePasswordError(error, "fallback", tErrors)).toStrictEqual({
      field: "currentPassword",
      message: enCatalog.errors.byCode.INVALID_PASSWORD,
    });
  });

  it("puts every other rejection on the new password field", () => {
    const error = toAuthClientError(
      { code: "PASSWORD_TOO_SHORT", status: 400, message: "Password too short" },
      "fallback",
    );

    expect(resolveChangePasswordError(error, "fallback", tErrors)).toStrictEqual({
      field: "newPassword",
      message: enCatalog.errors.byCode.PASSWORD_TOO_SHORT,
    });
  });

  it("falls back to the caller copy when the failure carries no code", () => {
    expect(resolveChangePasswordError(new Error("boom"), "fallback", tErrors)).toStrictEqual({
      field: "newPassword",
      message: "fallback",
    });
  });
});
