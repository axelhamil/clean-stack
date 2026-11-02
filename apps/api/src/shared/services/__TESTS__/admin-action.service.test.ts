import { describe, expect, it, mock } from "bun:test";
import { UnitOfWorkContext } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import { mockUnitOfWork } from "@packages/test/bun/unit-of-work";
import { mockInstrumentation } from "../../../__TESTS__/mock-instrumentation";

const emitted: { type: string; payload: Record<string, unknown> }[] = [];

const realEventEmitter = await import("../../event-emitter");

mock.module("../../event-emitter", () => ({
  ...realEventEmitter,
  emitEvent: mock(
    async (
      _o: unknown,
      type: string,
      _at: string,
      _ai: string,
      payload: Record<string, unknown>,
    ) => {
      emitted.push({ type, payload });
      return "evt-1";
    },
  ),
}));

const writeTransactions: unknown[] = [];
const setOrgSsoEnforced = mock(async (_organizationId: string, _enforced: boolean) => {
  writeTransactions.push(UnitOfWorkContext.transaction());
});
const realAuthQueries = await import("../../../auth-queries");
mock.module("../../../auth-queries", () => ({ ...realAuthQueries, setOrgSsoEnforced }));

const { AdminActionService } = await import("../admin-action.service");

const instrumentation = mockInstrumentation();

function service(unitOfWork = mockUnitOfWork().unitOfWork) {
  return new AdminActionService({} as never, unitOfWork, instrumentation);
}

describe("AdminActionService", () => {
  describe("setSsoEnforcement", () => {
    it("writes the flag and emits the event in one committed unit of work", async () => {
      setOrgSsoEnforced.mockClear();
      writeTransactions.length = 0;
      emitted.length = 0;
      const { unitOfWork, outcome } = mockUnitOfWork();
      const result = await service(unitOfWork).setSsoEnforcement({
        organizationId: "org-1",
        enforced: true,
        actorUserId: "owner-1",
        viaPlatformAdmin: false,
      });

      expect(result.isSuccess).toBe(true);
      expect(outcome()).toBe("committed");
      expect(setOrgSsoEnforced).toHaveBeenCalledWith("org-1", true);
      expect(writeTransactions[0]).toBeDefined();
      expect(emitted.map((e) => e.type)).toEqual([EventTypes.SSO_ENFORCEMENT_CHANGED]);
    });

    it("records the platform admin as actor when lifting sso enforcement", async () => {
      emitted.length = 0;
      const result = await service().setSsoEnforcement({
        organizationId: "org-1",
        enforced: false,
        actorUserId: "admin-9",
        viaPlatformAdmin: true,
      });

      expect(result.isSuccess).toBe(true);
      expect(emitted[0]?.type).toBe(EventTypes.SSO_ENFORCEMENT_CHANGED);
      expect(emitted[0]?.payload).toMatchObject({
        actorUserId: "admin-9",
        organizationId: "org-1",
        enforced: false,
        viaPlatformAdmin: true,
      });
    });

    it("records the org owner as actor when enabling sso enforcement", async () => {
      emitted.length = 0;
      const result = await service().setSsoEnforcement({
        organizationId: "org-1",
        enforced: true,
        actorUserId: "owner-1",
        viaPlatformAdmin: false,
      });

      expect(result.isSuccess).toBe(true);
      expect(emitted[0]?.type).toBe(EventTypes.SSO_ENFORCEMENT_CHANGED);
      expect(emitted[0]?.payload).toMatchObject({
        actorUserId: "owner-1",
        organizationId: "org-1",
        enforced: true,
        viaPlatformAdmin: false,
      });
    });
  });
});
