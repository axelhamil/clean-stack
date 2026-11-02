import { describe, expect, test } from "vitest";
import { ALL_EVENT_TYPES } from "../event-types";
import {
  forcedLevelOf,
  isNotifiable,
  NOTIFICATION_MAP,
  notificationConfigOf,
  publicNotificationPayload,
} from "../notification-map";

describe("NOTIFICATION_MAP", () => {
  test("keeps pure audit events out of notifications", () => {
    expect(isNotifiable("api_token.used")).toBe(false);
    expect(isNotifiable("security.csp.violation")).toBe(false);
    expect(isNotifiable("webhook.delivery.exhausted")).toBe(false);
  });

  test("only keys the map by known event types", () => {
    for (const key of Object.keys(NOTIFICATION_MAP)) {
      expect(ALL_EVENT_TYPES).toContain(key);
    }
  });

  test("forces security events", () => {
    const config = notificationConfigOf("user.password_changed");
    expect(config?.forced).toBe(true);
    expect(config?.category).toBe("security");
  });

  test("targets billing:read, not manage, for billing.payment.failed", () => {
    const config = notificationConfigOf("billing.payment.failed");
    expect(config?.audience).toEqual({ can: { billing: ["read"] } });
  });

  test("never sends a forced event to the whole org", () => {
    for (const [type, config] of Object.entries(NOTIFICATION_MAP)) {
      if (!config.forced) continue;
      expect(config.audience, `${type} is forced to the whole org`).not.toBe("org:all");
    }
  });

  test("tells a fully forced category from a mixed one", () => {
    expect(forcedLevelOf("security")).toBe("all");
    expect(forcedLevelOf("billing")).toBe("some");
    expect(forcedLevelOf("org")).toBe("none");
    expect(forcedLevelOf("activity")).toBe("none");
  });

  test("declares explicitly what each notifiable event sends to the browser", () => {
    for (const [type, config] of Object.entries(NOTIFICATION_MAP)) {
      expect(Array.isArray(config.payloadFields), `${type} has no allowlist`).toBe(true);
    }
  });

  test("lets only declared fields through publicNotificationPayload", () => {
    const visible = publicNotificationPayload("org.member.invited", {
      organizationId: "org-1",
      invitationId: "token-secret",
      inviterUserId: "user-9",
      email: "a@b.com",
      role: "member",
    });

    expect(visible).toEqual({ email: "a@b.com", role: "member" });
  });

  test("returns nothing for an unknown event or a missing payload", () => {
    expect(publicNotificationPayload("event.unknown", { secret: 1 })).toEqual({});
    expect(publicNotificationPayload("org.member.invited", null)).toEqual({});
    expect(publicNotificationPayload("org.member.invited", "text")).toEqual({});
  });

  test("omits a declared field missing from the payload instead of returning undefined", () => {
    expect(publicNotificationPayload("user.passkey.added", { userId: "u1" })).toEqual({});
  });

  test("never batches a forced event through dedupWindow", () => {
    for (const [type, config] of Object.entries(NOTIFICATION_MAP)) {
      if (!config.forced) continue;
      expect(config.dedupWindow, `${type} is forced with a dedup window`).toBeUndefined();
    }
  });
});
