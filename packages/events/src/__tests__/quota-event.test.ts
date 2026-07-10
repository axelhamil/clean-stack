import { describe, expect, it } from "vitest";
import { EventTypes } from "../event-types";
import { PayloadByEventType } from "../payloads";
import { retentionFor } from "../retention-map";

describe("billing.quota.exceeded event", () => {
  it("is registered with a payload and operational retention", () => {
    expect(EventTypes.BILLING_QUOTA_EXCEEDED).toBe("billing.quota.exceeded");
    expect(retentionFor(EventTypes.BILLING_QUOTA_EXCEEDED)).toBe("operational");
    const schema = PayloadByEventType[EventTypes.BILLING_QUOTA_EXCEEDED];
    const ok = schema.safeParse({
      organizationId: "org1",
      resource: "uploads",
      limit: 10,
      attempted: 10,
      tier: "free",
      actorUserId: "u1",
    });
    expect(ok.success).toBe(true);
  });
});
