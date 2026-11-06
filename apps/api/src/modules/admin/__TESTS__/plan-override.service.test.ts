import { describe, expect, it } from "bun:test";
import { Option, Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { enqueuedEvents } from "@packages/outbox/testing/enqueued-events";
import { mockPort } from "@packages/test/bun";
import { mockUnitOfWork } from "@packages/test/bun/unit-of-work";
import type { IPlanOverrideStore } from "../../../shared/ports/plan-override.port";
import type { AdminOrgRow, IAdminOrgStore } from "../application/ports/admin-org-store.port";
import { PlanOverrideService } from "../application/services/plan-override.service";

const ORG: AdminOrgRow = {
  id: "org-1",
  name: "Acme",
  slug: "acme",
  memberCount: 1,
  createdAt: new Date("2026-01-01"),
  ssoEnforced: false,
};
const INPUT = {
  actorUserId: "staff-1",
  organizationId: "org-1",
  tier: "business",
  expiresAt: new Date("2030-01-01T00:00:00.000Z"),
  note: "Pilot",
};

function setup(given: { open?: string; org?: boolean; inserted?: boolean; active?: boolean } = {}) {
  const overrides = mockPort<IPlanOverrideStore>();
  overrides.closeOpen.mockImplementation(async () => Result.ok(Option.fromNullable(given.open)));
  overrides.insert.mockImplementation(async () => Result.ok(given.inserted ?? true));
  overrides.revokeActive.mockImplementation(async () =>
    Result.ok(
      given.active === false ? Option.none() : Option.some({ id: "ov-1", tier: "business" }),
    ),
  );

  const orgs = mockPort<IAdminOrgStore>();
  orgs.findOrgById.mockImplementation(async () =>
    Result.ok(given.org === false ? Option.none() : Option.some(ORG)),
  );

  const outbox = mockPort<IOutboxRepository>();
  outbox.enqueue.mockImplementation(async () => {});

  const { unitOfWork } = mockUnitOfWork();

  return {
    outbox,
    overrides,
    service: new PlanOverrideService(overrides, orgs, outbox, unitOfWork),
  };
}

describe("PlanOverrideService", () => {
  describe("set", () => {
    it("names the actor and the replaced override in the event, never the note", async () => {
      const { service, outbox } = setup({ open: "ov-old" });

      const result = await service.set(INPUT);

      expect(result.isSuccess).toBe(true);
      const [event] = enqueuedEvents(outbox);
      expect(event?.eventType).toBe(EventTypes.ADMIN_PLAN_OVERRIDE_SET);
      expect(event?.payload).toMatchObject({
        actorUserId: "staff-1",
        organizationId: "org-1",
        tier: "business",
        expiresAt: "2030-01-01T00:00:00.000Z",
        replacedOverrideId: "ov-old",
      });
      expect(JSON.stringify(event?.payload)).not.toContain("Pilot");
    });

    it("refuses an unknown organization before writing", async () => {
      const { service, overrides } = setup({ org: false });

      const result = await service.set(INPUT);

      expect(result.getError().code).toBe("ADMIN_ORG_NOT_FOUND");
      expect(overrides.insert).not.toHaveBeenCalled();
    });

    it("answers a conflict and announces nothing when a colleague got there first", async () => {
      const { service, outbox } = setup({ inserted: false });

      const result = await service.set(INPUT);

      expect(result.getError().code).toBe("ADMIN_PLAN_OVERRIDE_ALREADY_SET_CONFLICT");
      expect(enqueuedEvents(outbox)).toEqual([]);
    });
  });

  describe("revoke", () => {
    it("announces the revocation with its actor", async () => {
      const { service, outbox } = setup();

      await service.revoke({ actorUserId: "staff-1", organizationId: "org-1" });

      const [event] = enqueuedEvents(outbox);
      expect(event?.eventType).toBe(EventTypes.ADMIN_PLAN_OVERRIDE_REVOKED);
      expect(event?.payload).toMatchObject({ actorUserId: "staff-1", overrideId: "ov-1" });
    });

    it("answers not found when nothing is active", async () => {
      const { service, outbox } = setup({ active: false });

      const result = await service.revoke({ actorUserId: "staff-1", organizationId: "org-1" });

      expect(result.getError().code).toBe("ADMIN_PLAN_OVERRIDE_NOT_FOUND");
      expect(enqueuedEvents(outbox)).toEqual([]);
    });
  });
});
