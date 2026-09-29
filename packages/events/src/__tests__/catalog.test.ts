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

describe("cookie consent linked event", () => {
  const schema = PayloadByEventType[EventTypes.USER_COOKIE_CONSENT_LINKED];

  it("names the signed-in user and the records it now owns", () => {
    const parsed = schema.safeParse({
      userId: "u1",
      subjectId: "subj-1",
      consentRecordIds: ["c1"],
    });
    expect(parsed.success).toBe(true);
  });

  it("refuses a link that attached no record", () => {
    const parsed = schema.safeParse({ userId: "u1", subjectId: "subj-1", consentRecordIds: [] });
    expect(parsed.success).toBe(false);
  });
});

describe("api token created event", () => {
  it("reads back an expiry serialized to JSON by the outbox", () => {
    const expiresAt = new Date("2027-01-01T00:00:00.000Z");
    const stored = JSON.parse(
      JSON.stringify({
        userId: "u1",
        actorUserId: "u1",
        organizationId: null,
        tokenId: "t1",
        name: "ci",
        scopes: ["read:profile"],
        expiresAt,
      }),
    );

    const parsed = PayloadByEventType[EventTypes.API_TOKEN_CREATED].safeParse(stored);

    expect(parsed.success).toBe(true);
    expect(parsed.data?.expiresAt).toEqual(expiresAt);
  });
});
