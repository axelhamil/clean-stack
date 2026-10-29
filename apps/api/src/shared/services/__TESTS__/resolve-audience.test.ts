import { describe, expect, test } from "bun:test";
import type { DeliveredEvent } from "../../ports/outbox.port";
import { resolveAudience } from "../resolve-audience";

const baseEvent = (payload: unknown, organizationId?: string): DeliveredEvent => ({
  eventId: "01J000000000000000000000",
  eventType: "org.member.joined",
  aggregateId: "agg-1",
  aggregateType: "organization",
  organizationId,
  payload,
  dateOccurred: new Date("2026-08-07T10:00:00Z"),
});

const targetOf = (audience: Parameters<typeof resolveAudience>[0], event: DeliveredEvent) =>
  resolveAudience(audience, event).toNull();

describe("resolveAudience", () => {
  test("self targets the payload userId", () => {
    expect(targetOf("self", baseEvent({ userId: "user-1" }))).toEqual({
      kind: "user",
      userId: "user-1",
    });
  });

  test("actor targets actorUserId ahead of userId", () => {
    expect(targetOf("actor", baseEvent({ userId: "subject", actorUserId: "actor" }))).toEqual({
      kind: "user",
      userId: "actor",
    });
  });

  test("actor follows the full actor key priority", () => {
    expect(targetOf("actor", baseEvent({ userId: "subject", ownerUserId: "owner" }))).toEqual({
      kind: "user",
      userId: "owner",
    });
    expect(
      targetOf(
        "actor",
        baseEvent({ userId: "subject", ownerUserId: "owner", inviterUserId: "inviter" }),
      ),
    ).toEqual({ kind: "user", userId: "inviter" });
  });

  test("org:all targets the whole org", () => {
    expect(targetOf("org:all", baseEvent({}, "org-1"))).toEqual({
      kind: "org",
      organizationId: "org-1",
      roles: "all",
    });
  });

  test("a capability resolves to the roles that hold it", () => {
    expect(targetOf({ can: { billing: ["read"] } }, baseEvent({}, "org-1"))).toEqual({
      kind: "org",
      organizationId: "org-1",
      roles: ["owner", "admin"],
    });
  });

  test("an org audience without organizationId targets nobody", () => {
    expect(resolveAudience("org:all", baseEvent({})).isNone()).toBe(true);
    expect(resolveAudience({ can: { billing: ["read"] } }, baseEvent({})).isNone()).toBe(true);
  });

  test("self without a usable userId targets nobody", () => {
    expect(resolveAudience("self", baseEvent({ foo: "bar" })).isNone()).toBe(true);
    expect(resolveAudience("self", baseEvent({ userId: "" })).isNone()).toBe(true);
  });
});
