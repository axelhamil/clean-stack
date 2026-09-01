import { describe, expect, it } from "vitest";
import {
  ALL_EVENT_TYPES,
  EventTypes,
  matchesSubscription,
  SUBSCRIBABLE_EVENT_TYPES,
} from "../event-types";
import { isPublicEvent, VISIBILITY } from "../visibility-map";

describe("event visibility", () => {
  it("classifies every event in the catalog", () => {
    for (const type of ALL_EVENT_TYPES) expect(VISIBILITY[type]).toBeDefined();
  });

  it("keeps security and admin events out of the subscribable set", () => {
    expect(isPublicEvent(EventTypes.SECURITY_CSRF_REJECTED)).toBe(false);
    expect(isPublicEvent(EventTypes.ADMIN_USER_BANNED)).toBe(false);
    expect(SUBSCRIBABLE_EVENT_TYPES).not.toContain(EventTypes.SECURITY_CSRF_REJECTED);
  });

  it("refuses a subscription match on an internal event even with a wildcard", () => {
    expect(matchesSubscription(EventTypes.SECURITY_CSRF_REJECTED, ["*"])).toBe(false);
    expect(matchesSubscription(EventTypes.ADMIN_USER_BANNED, ["admin.*"])).toBe(false);
    expect(matchesSubscription(EventTypes.ORG_MEMBER_JOINED, ["org.*"])).toBe(true);
  });

  it("exposes api_token created and revoked but not used", () => {
    expect(isPublicEvent(EventTypes.API_TOKEN_CREATED)).toBe(true);
    expect(isPublicEvent(EventTypes.API_TOKEN_REVOKED)).toBe(true);
    expect(isPublicEvent(EventTypes.API_TOKEN_USED)).toBe(false);
  });
});
