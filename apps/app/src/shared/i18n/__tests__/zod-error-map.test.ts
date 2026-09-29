import enCatalog from "@packages/i18n/src/catalogs/en";
import frCatalog from "@packages/i18n/src/catalogs/fr";
import { describe, expect, it } from "vitest";
import { signInSchema } from "../../auth/auth.schema";
import { applyZodErrorMap } from "../zod-error-map";
import { catalogT } from "./catalog-t";

function passwordIssueMessage() {
  const result = signInSchema.safeParse({
    email: "a@b.com",
    password: "",
    rememberMe: false,
  });
  if (result.success) throw new Error("expected the empty password to fail validation");
  const passwordIssue = result.error.issues.find((issue) => issue.path[0] === "password");
  if (!passwordIssue) throw new Error("expected a password issue");
  return passwordIssue.message;
}

describe("applyZodErrorMap", () => {
  it("localizes a required-field failure to French under locale fr", () => {
    applyZodErrorMap(catalogT(frCatalog.errors));
    expect(passwordIssueMessage()).toBe(frCatalog.errors.validation.required);
  });

  it("localizes a required-field failure to English under locale en", () => {
    applyZodErrorMap(catalogT(enCatalog.errors));
    expect(passwordIssueMessage()).toBe(enCatalog.errors.validation.required);
  });

  it("keeps the two locales' copy distinct so the assertions above are not a tautology", () => {
    expect(frCatalog.errors.validation.required).not.toBe(enCatalog.errors.validation.required);
  });
});
