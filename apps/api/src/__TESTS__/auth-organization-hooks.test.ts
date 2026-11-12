import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { IEntitlementsReader } from "@modules/billing/application/ports/entitlements-reader.port";
import { ENTITLEMENTS } from "@modules/billing/domain/entitlements";
import { EventTypes } from "@packages/events";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { enqueuedEvents } from "@packages/outbox/testing/enqueued-events";
import { mockPort } from "@packages/test/bun";
import { mockUnitOfWork } from "@packages/test/bun/unit-of-work";
import { ORGANIZATION_SEAT_PAYMENT_REQUIRED } from "../shared/auth/organization-seats";
import { fakeAuthDeps, outermostUnitOfWork } from "./fake-auth-deps";

const MAX_MEMBERS = 3;

const outbox = mockPort<IOutboxRepository>();
const { unitOfWork } = mockUnitOfWork();

const deleteOrgIfEmpty = mock(async () => false);
const countActiveMembers = mock(async () => 0);

const realAuthQueries = await import("../auth/queries");
mock.module("../auth/queries", () => ({
  ...realAuthQueries,
  deleteOrgIfEmpty,
  countActiveMembers,
  lockSeatsOf: async () => undefined,
}));

const { createAuth } = await import("../auth/create-auth");
const entitlements = mockPort<IEntitlementsReader>();
entitlements.getEntitlements.mockImplementation(async () => ({
  ...ENTITLEMENTS.free,
  tier: "free",
  status: "free",
  hasSubscription: false,
  maxMembers: MAX_MEMBERS,
}));
const auth = createAuth(
  fakeAuthDeps({ outbox, uow: outermostUnitOfWork(unitOfWork), entitlements }),
);

const hooks = auth.options.plugins.find((plugin) => plugin.id === "organization")?.options
  ?.organizationHooks;

function runHook(name: keyof NonNullable<typeof hooks>, input: object) {
  const found = hooks?.[name];
  if (!found) throw new Error(`organization plugin has no ${name}`);

  return found(input as never);
}

const TEAM = { id: "org-1", slug: "team", name: "Team", logo: null };
const PERSONAL = { id: "org-2", slug: "personal-org-2", name: "Personal", logo: null };
const ADMIN = { id: "admin-1" };
const MEMBER = { id: "member-1", userId: "user-2", role: "admin" };

const eventTypes = () => enqueuedEvents(outbox).map((event) => event.eventType);
const firstEvent = () => enqueuedEvents(outbox)[0];

beforeEach(() => {
  outbox.enqueue.mockClear();
  deleteOrgIfEmpty.mockReset();
  deleteOrgIfEmpty.mockResolvedValue(false);
  countActiveMembers.mockReset();
  countActiveMembers.mockResolvedValue(0);
});

describe("organization hooks, organization lifecycle", () => {
  it("given a team org created, then it emits org.created", async () => {
    await runHook("afterCreateOrganization", { organization: TEAM, member: { userId: "user-1" } });

    expect(firstEvent()).toMatchObject({
      eventType: EventTypes.ORG_CREATED,
      payload: { organizationId: "org-1", ownerUserId: "user-1", slug: "team" },
    });
  });

  it("given a personal org created, then it emits nothing", async () => {
    await runHook("afterCreateOrganization", {
      organization: PERSONAL,
      member: { userId: "user-1" },
    });

    expect(eventTypes()).toEqual([]);
  });

  it("given an org updated, then it emits org.updated with the actor", async () => {
    await runHook("afterUpdateOrganization", { organization: TEAM, user: ADMIN });

    expect(firstEvent()).toMatchObject({
      eventType: EventTypes.ORG_UPDATED,
      payload: { actorUserId: "admin-1" },
    });
  });

  it("given a team org deleted, then it emits org.deleted", async () => {
    await runHook("afterDeleteOrganization", { organization: TEAM, user: ADMIN });

    expect(firstEvent()).toMatchObject({
      eventType: EventTypes.ORG_DELETED,
      payload: { actorUserId: "admin-1" },
    });
  });

  it("given a personal org deleted, then it emits nothing", async () => {
    await runHook("afterDeleteOrganization", { organization: PERSONAL, user: ADMIN });

    expect(eventTypes()).toEqual([]);
  });

  it("given a personal org, when its deletion is attempted, then it is refused", async () => {
    await expect(
      runHook("beforeDeleteOrganization", { organization: PERSONAL, user: ADMIN }),
    ).rejects.toThrow("Personal organization cannot be deleted");
  });
});

describe("organization hooks, members", () => {
  it("given a user adding themselves, then org.member.joined carries no separate actor", async () => {
    await runHook("afterAddMember", {
      member: { ...MEMBER, userId: "user-2" },
      user: { id: "user-2" },
      organization: TEAM,
    });

    expect(firstEvent()).toMatchObject({ eventType: EventTypes.ORG_MEMBER_JOINED });
    expect(firstEvent()?.payload).toMatchObject({ userId: "user-2", actorUserId: undefined });
  });

  it("given an admin adding a member, then org.member.joined names the admin", async () => {
    await runHook("afterAddMember", { member: MEMBER, user: ADMIN, organization: TEAM });

    expect(firstEvent()?.payload).toMatchObject({ userId: "user-2", actorUserId: "admin-1" });
  });

  it("given the last member removed from a team org, then the org is deleted with it", async () => {
    deleteOrgIfEmpty.mockResolvedValue(true);

    await runHook("afterRemoveMember", { member: MEMBER, user: ADMIN, organization: TEAM });

    expect(eventTypes()).toEqual([EventTypes.ORG_MEMBER_REMOVED, EventTypes.ORG_DELETED]);
  });

  it("given a member removed from a team org that still has members, then only the removal is emitted", async () => {
    await runHook("afterRemoveMember", { member: MEMBER, user: ADMIN, organization: TEAM });

    expect(eventTypes()).toEqual([EventTypes.ORG_MEMBER_REMOVED]);
  });

  it("given a member removed from a personal org, then the org is never collapsed", async () => {
    deleteOrgIfEmpty.mockResolvedValue(true);

    await runHook("afterRemoveMember", { member: MEMBER, user: ADMIN, organization: PERSONAL });

    expect(eventTypes()).toEqual([EventTypes.ORG_MEMBER_REMOVED]);
    expect(deleteOrgIfEmpty).not.toHaveBeenCalled();
  });

  it("given a role change, then it emits the previous and the new role", async () => {
    await runHook("afterUpdateMemberRole", {
      member: MEMBER,
      previousRole: "member",
      user: ADMIN,
      organization: TEAM,
    });

    expect(firstEvent()).toMatchObject({
      eventType: EventTypes.ORG_MEMBER_ROLE_CHANGED,
      payload: { previousRole: "member", newRole: "admin", actorUserId: "admin-1" },
    });
  });
});

describe("organization hooks, invitations", () => {
  const INVITATION = { id: "inv-1", email: "new@example.com", inviterId: "admin-1" };

  it("given an invitation without a role, then org.member.invited defaults it to member", async () => {
    await runHook("afterCreateInvitation", { invitation: INVITATION, organization: TEAM });

    expect(firstEvent()).toMatchObject({
      eventType: EventTypes.ORG_MEMBER_INVITED,
      payload: { invitationId: "inv-1", role: "member", inviterUserId: "admin-1" },
    });
  });

  it("given an invitation cancelled, then it emits org.invitation.cancelled", async () => {
    await runHook("afterCancelInvitation", {
      invitation: INVITATION,
      cancelledBy: ADMIN,
      organization: TEAM,
    });

    expect(firstEvent()).toMatchObject({
      eventType: EventTypes.ORG_INVITATION_CANCELLED,
      payload: { actorUserId: "admin-1" },
    });
  });

  it("given an invitation accepted, then it emits org.member.joined", async () => {
    await runHook("afterAcceptInvitation", { member: MEMBER, organization: TEAM });

    expect(firstEvent()).toMatchObject({
      eventType: EventTypes.ORG_MEMBER_JOINED,
      payload: { userId: "user-2", role: "admin" },
    });
  });
});

describe("organization hooks, seat gate", () => {
  it.each(["beforeAddMember", "beforeCreateInvitation", "beforeAcceptInvitation"] as const)(
    "given an org at its seat cap, when %s runs, then it asks for a plan upgrade",
    async (name) => {
      countActiveMembers.mockResolvedValue(MAX_MEMBERS);

      await expect(runHook(name, { organization: TEAM })).rejects.toMatchObject({
        body: { code: ORGANIZATION_SEAT_PAYMENT_REQUIRED },
      });
    },
  );

  it("given an org below its seat cap, when a member is added, then it lets the member in", async () => {
    countActiveMembers.mockResolvedValue(MAX_MEMBERS - 1);

    await expect(runHook("beforeAddMember", { organization: TEAM })).resolves.toBeUndefined();
  });
});
