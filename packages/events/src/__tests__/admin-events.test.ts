import { describe, expect, it } from "vitest";
import { EventTypes, SUBSCRIBABLE_EVENT_TYPES } from "../event-types";
import {
  AdminImpersonationStartedPayload,
  AdminStaffAddedPayload,
  AdminUserBannedPayload,
} from "../payloads";
import { retentionFor } from "../retention-map";

describe("admin events", () => {
  it("declares the nine admin event types", () => {
    expect(Object.values(EventTypes).filter((t) => t.startsWith("admin."))).toHaveLength(9);
  });

  it("retains every admin event under the compliance policy", () => {
    for (const type of Object.values(EventTypes).filter((t) => t.startsWith("admin."))) {
      expect(retentionFor(type)).toBe("compliance");
    }
  });

  it("keeps admin events out of the public subscribable set", () => {
    expect(SUBSCRIBABLE_EVENT_TYPES).not.toContain(EventTypes.ADMIN_USER_BANNED);
  });

  it("states the actor of a bootstrap staff row as an explicit null", () => {
    const missing = AdminStaffAddedPayload.safeParse({
      userId: "u",
      role: "manager",
      source: "env",
    });
    const explicit = AdminStaffAddedPayload.safeParse({
      actorUserId: null,
      userId: "u",
      role: "manager",
      source: "env",
    });

    expect(missing.success).toBe(false);
    expect(explicit.success).toBe(true);
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
