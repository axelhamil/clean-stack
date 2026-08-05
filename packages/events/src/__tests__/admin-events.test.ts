import { describe, expect, it } from "vitest";
import { EventTypes, SUBSCRIBABLE_EVENT_TYPES } from "../event-types";
import { AdminImpersonationStartedPayload, AdminUserBannedPayload } from "../payloads";
import { retentionFor } from "../retention-map";

describe("admin events", () => {
  it("declares the seven admin event types", () => {
    expect(Object.values(EventTypes).filter((t) => t.startsWith("admin."))).toHaveLength(7);
  });

  it("retains every admin event under the compliance policy", () => {
    for (const type of Object.values(EventTypes).filter((t) => t.startsWith("admin."))) {
      expect(retentionFor(type)).toBe("compliance");
    }
  });

  it("keeps admin events subscribable by webhook consumers", () => {
    expect(SUBSCRIBABLE_EVENT_TYPES).toContain(EventTypes.ADMIN_USER_BANNED);
  });

  it("requires a non-empty reason on impersonation start", () => {
    const parsed = AdminImpersonationStartedPayload.safeParse({
      actorUserId: "admin-1",
      userId: "user-2",
      reason: "",
      ip: "1.2.3.4",
      expiresAt: new Date().toISOString(),
    });
    expect(parsed.success).toBe(false);
  });

  it("separates the actor from the subject on a ban", () => {
    const parsed = AdminUserBannedPayload.parse({
      actorUserId: "admin-1",
      userId: "user-2",
      reason: "spam",
      expiresAt: null,
    });
    expect(parsed.actorUserId).not.toBe(parsed.userId);
  });
});
