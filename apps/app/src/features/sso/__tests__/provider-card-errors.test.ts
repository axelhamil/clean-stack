import { createI18n, loadCatalog } from "@packages/i18n";
import { describe, expect, it } from "vitest";
import { formatApiError } from "../../../shared/api/errors/messages";

async function frenchErrorsT() {
  const resources = await loadCatalog("fr");
  const i18n = await createI18n({ locale: "fr", resources });

  return i18n.getFixedT("fr", "errors");
}

/**
 * Proves `provider-card.tsx`'s `formatApiError({ code: err.message }, err.message, tErrors)`
 * resolves through the catalog end to end, against a real i18next instance
 * booted with the French resources (not the hand-rolled fake `t`
 * `messages.test.ts` uses), for the exact two error shapes
 * `assertSsoEntitlementFor` (apps/api/src/auth.ts) sends: an `APIError` whose
 * `.message` carries the business code, no separate `.code`.
 */
describe("provider-card SSO registration error routing (real French t)", () => {
  it("SSO_PLAN_REQUIRED resolves to the French byCode message, not the raw code", async () => {
    const tErrors = await frenchErrorsT();

    const err = new Error("SSO_PLAN_REQUIRED");
    const message = formatApiError({ code: err.message }, err.message, tErrors);

    expect(message).toBe("Votre forfait n'inclut pas le SSO.");
    expect(message).not.toBe("SSO_PLAN_REQUIRED");
  });

  it("SSO_ORGANIZATION_REQUIRED resolves to the French byCode message, not the raw code", async () => {
    const tErrors = await frenchErrorsT();

    const err = new Error("SSO_ORGANIZATION_REQUIRED");
    const message = formatApiError({ code: err.message }, err.message, tErrors);

    expect(message).toBe("Aucune organisation active.");
    expect(message).not.toBe("SSO_ORGANIZATION_REQUIRED");
  });

  it("an unrecognized error still surfaces the server's own message unchanged (no regression)", async () => {
    const tErrors = await frenchErrorsT();

    // e.g. a provider-already-registered rejection from the SSO plugin,
    // which is a real human sentence, not a pseudo-code.
    const err = new Error("A provider for this domain is already registered.");
    const message = formatApiError({ code: err.message }, err.message, tErrors);

    expect(message).toBe("A provider for this domain is already registered.");
  });
});
