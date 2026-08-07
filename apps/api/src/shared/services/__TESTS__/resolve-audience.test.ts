import { describe, expect, test } from "bun:test";
import { Option } from "@packages/ddd-kit";
import type { OutboxRecord } from "../../ports/outbox.port";
import { resolveAudience } from "../resolve-audience";

const baseEvent = (payload: unknown, orgId?: string): OutboxRecord => ({
  id: "01J000000000000000000000",
  eventType: "org.member.joined",
  aggregateId: "agg-1",
  aggregateType: "organization",
  organizationId: orgId ? Option.some(orgId) : Option.none(),
  payload,
  metadata: {} as OutboxRecord["metadata"],
  occurredAt: new Date("2026-08-07T10:00:00Z"),
  attempts: 0,
});

describe("resolveAudience", () => {
  test("self cible le userId du payload", () => {
    const target = resolveAudience("self", baseEvent({ userId: "user-1" }));
    expect(target).toEqual({ kind: "user", userId: "user-1" });
  });

  test("actor cible actorUserId en priorite sur userId", () => {
    const target = resolveAudience("actor", baseEvent({ userId: "sujet", actorUserId: "acteur" }));
    expect(target).toEqual({ kind: "user", userId: "acteur" });
  });

  test("actor respecte la priorite complete de extractActor", () => {
    expect(
      resolveAudience("actor", baseEvent({ userId: "sujet", ownerUserId: "proprio" })),
    ).toEqual({ kind: "user", userId: "proprio" });
    expect(
      resolveAudience(
        "actor",
        baseEvent({ userId: "sujet", ownerUserId: "proprio", inviterUserId: "invitant" }),
      ),
    ).toEqual({ kind: "user", userId: "invitant" });
  });

  test("org:all cible toute l'org", () => {
    const target = resolveAudience("org:all", baseEvent({}, "org-1"));
    expect(target).toEqual({ kind: "org", organizationId: "org-1", roles: "all" });
  });

  test("une capability se resout en liste de roles", () => {
    const target = resolveAudience({ can: { billing: ["read"] } }, baseEvent({}, "org-1"));
    expect(target).toEqual({
      kind: "org",
      organizationId: "org-1",
      roles: ["owner", "admin"],
    });
  });

  test("une audience org sans organizationId ne cible personne", () => {
    expect(resolveAudience("org:all", baseEvent({}))).toBeNull();
    expect(resolveAudience({ can: { billing: ["read"] } }, baseEvent({}))).toBeNull();
  });

  test("self sans userId exploitable ne cible personne", () => {
    expect(resolveAudience("self", baseEvent({ foo: "bar" }))).toBeNull();
  });
});
