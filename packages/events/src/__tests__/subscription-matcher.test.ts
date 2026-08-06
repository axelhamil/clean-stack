import { describe, expect, it } from "vitest";
import {
  ALL_EVENT_TYPES,
  EventTypes,
  eventGroupOf,
  isSubscribableSelector,
  matchesSubscription,
  SUBSCRIBABLE_EVENT_TYPES,
} from "../event-types";

describe("subscription partitioning", () => {
  it("subscribable set excludes webhook, security, and admin groups", () => {
    expect(SUBSCRIBABLE_EVENT_TYPES).not.toContain(EventTypes.WEBHOOK_TEST);
    expect(SUBSCRIBABLE_EVENT_TYPES).not.toContain(EventTypes.WEBHOOK_ENDPOINT_CREATED);
    expect(SUBSCRIBABLE_EVENT_TYPES).not.toContain(EventTypes.SECURITY_CSRF_REJECTED);
    expect(SUBSCRIBABLE_EVENT_TYPES).not.toContain(EventTypes.ADMIN_USER_BANNED);
    expect(SUBSCRIBABLE_EVENT_TYPES).toContain(EventTypes.USER_CREATED);
    expect(SUBSCRIBABLE_EVENT_TYPES.length).toBeLessThan(ALL_EVENT_TYPES.length);
  });
});

describe("eventGroupOf", () => {
  it("returns the prefix before the first dot", () => {
    expect(eventGroupOf("user.created")).toBe("user");
    expect(eventGroupOf("user.password_reset.requested")).toBe("user");
    expect(eventGroupOf("nogroup")).toBe("nogroup");
  });
});

describe("matchesSubscription", () => {
  it("exact match", () => {
    expect(matchesSubscription(EventTypes.USER_CREATED, ["user.created"])).toBe(true);
    expect(matchesSubscription(EventTypes.USER_CREATED, ["org.created"])).toBe(false);
  });
  it("group wildcard", () => {
    expect(matchesSubscription(EventTypes.USER_CREATED, ["user.*"])).toBe(true);
    expect(matchesSubscription(EventTypes.ORG_CREATED, ["user.*"])).toBe(false);
  });
  it("global wildcard", () => {
    expect(matchesSubscription(EventTypes.USER_CREATED, ["*"])).toBe(true);
  });
  it("internal events never fan out, even under *", () => {
    expect(matchesSubscription(EventTypes.WEBHOOK_TEST, ["*"])).toBe(false);
    expect(matchesSubscription(EventTypes.WEBHOOK_DELIVERY_EXHAUSTED, ["webhook.*"])).toBe(false);
  });
});

describe("isSubscribableSelector", () => {
  it("accepts exact subscribable, group wildcard, global", () => {
    expect(isSubscribableSelector("user.created")).toBe(true);
    expect(isSubscribableSelector("user.*")).toBe(true);
    expect(isSubscribableSelector("*")).toBe(true);
  });
  it("rejects internal names and unknown groups", () => {
    expect(isSubscribableSelector("webhook.test")).toBe(false);
    expect(isSubscribableSelector("bogus.created")).toBe(false);
    expect(isSubscribableSelector("bogus.*")).toBe(false);
  });
});
