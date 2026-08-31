import { describe, expect, it } from "vitest";
import { LEGAL_ROUTES } from "../legal-routes";

describe("LEGAL_ROUTES", () => {
  // A swapped `labelKey` (e.g. cookies pointed at the accessibility label)
  // type-checks and renders — only naming each pair catches it.
  it("points each route at its own label key", () => {
    expect(LEGAL_ROUTES.map((r) => ({ to: r.to, labelKey: r.labelKey }))).toStrictEqual([
      { to: "/legal/data-rights", labelKey: "legal.routes.dataRights" },
      { to: "/legal/privacy-policy", labelKey: "legal.routes.privacyPolicy" },
      { to: "/legal/terms", labelKey: "legal.routes.terms" },
      { to: "/legal/sub-processors", labelKey: "legal.routes.subProcessors" },
      { to: "/legal/accessibility", labelKey: "legal.routes.accessibility" },
      { to: "/legal/cookies", labelKey: "legal.routes.cookies" },
    ]);
  });

  it("has no duplicate route or label key", () => {
    const tos = LEGAL_ROUTES.map((r) => r.to);
    const keys = LEGAL_ROUTES.map((r) => r.labelKey);
    expect(new Set(tos).size).toBe(tos.length);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
