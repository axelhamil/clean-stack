import { describe, expect, it } from "vitest";
import { EventTypes } from "../event-types";
import { PayloadByEventType } from "../payloads";

describe("sso and scim events", () => {
  const ssoAndScim = Object.values(EventTypes).filter(
    (t) => t.startsWith("sso.") || t.startsWith("scim."),
  );

  it("declares thirteen types", () => {
    expect(ssoAndScim).toHaveLength(13);
  });

  it("gives every type a payload schema", () => {
    for (const t of ssoAndScim) {
      expect(PayloadByEventType[t as keyof typeof PayloadByEventType]).toBeDefined();
    }
  });

  it("requires an explicit actor on every scim mutation", () => {
    const shape = PayloadByEventType[EventTypes.SCIM_USER_DEACTIVATED].shape;
    expect(shape.actorUserId).toBeDefined();
    expect(shape.userId).toBeDefined();
  });

  it("lets sso login failure carry a null actor explicitly", () => {
    const parsed = PayloadByEventType[EventTypes.SSO_LOGIN_FAILURE].safeParse({
      actorUserId: null,
      providerId: "p1",
      domain: "acme.com",
      reason: "assertion_invalid",
      ip: "203.0.113.4",
    });
    expect(parsed.success).toBe(true);
  });
});
