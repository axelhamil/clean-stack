import { describe, expect, test } from "bun:test";
import { Option } from "@packages/ddd-kit";
import {
  type AudienceSource,
  resolveAudience,
} from "../../../application/services/resolve-audience.service";

const baseEvent = (payload: unknown, organizationId?: string): AudienceSource => ({
  payload,
  organizationId: Option.fromNullable(organizationId),
});

const targetOf = (audience: Parameters<typeof resolveAudience>[0], event: AudienceSource) =>
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

  test("a staff audience keeps the requester and leaves out a system actor", () => {
    const target = targetOf(
      { staff: "approvals.decide" },
      baseEvent({ requesterUserId: "r", userId: "subject", actorUserId: null }),
    );

    expect(target).toMatchObject({ kind: "staff", permission: "approvals.decide" });
    if (target?.kind !== "staff") throw new Error("expected a staff target");
    expect(target.requesterUserId.unwrap()).toBe("r");
    expect(target.actorUserId.isNone()).toBe(true);
    expect(target.subjectUserId.unwrap()).toBe("subject");
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
