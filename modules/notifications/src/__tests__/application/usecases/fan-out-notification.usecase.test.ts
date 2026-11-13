import { describe, expect, it } from "bun:test";
import { rolesWith } from "@packages/access-control";
import { Option, Result, UnitOfWorkContext } from "@packages/ddd-kit";
import { mockPort } from "@packages/test/bun";
import { mockUnitOfWork } from "@packages/test/bun/unit-of-work";
import type { INotificationFanoutRepository } from "../../../application/ports/repositories/notification-fanout.port";
import type { IStaffRecipientsReader } from "../../../application/ports/services/staff-recipients.port";
import type { FanOutNotificationInput } from "../../../application/usecases/fan-out-notification/fan-out-notification.dto";
import { FanOutNotificationUseCase } from "../../../application/usecases/fan-out-notification/fan-out-notification.usecase";

const STAFF = { PLATFORM_ADMIN_IDS: ["root-1"], PLATFORM_ADMIN_REQUIRE_MFA: true };

function given() {
  const fanouts = mockPort<INotificationFanoutRepository>();
  const staff = mockPort<IStaffRecipientsReader>();
  const seen: unknown[] = [];
  fanouts.fanOut.mockImplementation(async () => {
    seen.push(UnitOfWorkContext.transaction());
    return Result.ok();
  });
  const useCase = new FanOutNotificationUseCase(fanouts, staff, mockUnitOfWork().unitOfWork, {
    digestHourUtc: 8,
    staff: STAFF,
  });

  return { fanouts, staff, seen, useCase };
}

const event = (
  eventType: string,
  payload: unknown,
  organizationId: Option<string> = Option.none(),
): FanOutNotificationInput => ({
  eventId: "evt-1",
  eventType,
  aggregateId: "agg-1",
  organizationId,
  payload,
  occurredAt: new Date("2026-08-07T10:15:00.000Z"),
});

const fannedOut = (fanouts: ReturnType<typeof given>["fanouts"]) =>
  fanouts.fanOut.mock.calls.map(([fanout]) => fanout);

describe("fan a delivered event out into notifications", () => {
  it("writes nothing for an event the notification map does not list", async () => {
    const { fanouts, useCase } = given();

    const result = await useCase.execute(event("api_token.used", { userId: "u1" }));

    expect(result.isSuccess).toBe(true);
    expect(fannedOut(fanouts)).toEqual([]);
  });

  it("writes nothing when the event names nobody in its audience", async () => {
    const { fanouts, useCase } = given();

    const result = await useCase.execute(event("billing.payment.failed", {}));

    expect(result.isSuccess).toBe(true);
    expect(fannedOut(fanouts)).toEqual([]);
  });

  it("notifies the subject of a self event once per event, inside a unit of work, with every digest due date", async () => {
    const { fanouts, seen, useCase } = given();

    const result = await useCase.execute(event("user.password_changed", { userId: "u1" }));

    expect(result.isSuccess).toBe(true);
    expect(fannedOut(fanouts)).toEqual([
      {
        recipients: { kind: "user", userId: "u1" },
        organizationId: Option.none(),
        category: "security",
        eventType: "user.password_changed",
        groupKey: Option.none(),
        dedupKey: "event:evt-1",
        payload: { userId: "u1" },
        forced: true,
        emailDueAt: {
          immediate: new Date("2026-08-07T10:15:00.000Z"),
          hourly: new Date("2026-08-07T11:00:00.000Z"),
          daily: new Date("2026-08-08T08:00:00.000Z"),
        },
      },
    ]);
    expect(seen[0]).toBeDefined();
  });

  it("notifies the org members who hold the capability, grouped by resource", async () => {
    const { fanouts, useCase } = given();

    await useCase.execute(event("org.member.joined", { role: "member" }, Option.some("org-1")));

    expect(fannedOut(fanouts)[0]).toMatchObject({
      recipients: {
        kind: "org",
        organizationId: "org-1",
        roles: rolesWith({ organization: ["update"] }),
      },
      organizationId: Option.some("org-1"),
      groupKey: Option.some("org.member.joined:agg-1"),
      forced: false,
    });
  });

  it("collapses the events of one window onto one key, so a redelivery or a burst writes once", async () => {
    const { fanouts, useCase } = given();

    await useCase.execute(event("billing.quota.exceeded", {}, Option.some("org-1")));

    expect(fannedOut(fanouts)[0]?.dedupKey).toBe("billing.quota.exceeded:agg-1:2026-08-07");
  });

  it("notifies the staff the host resolves for the permission, read with the staff settings", async () => {
    const { fanouts, staff, useCase } = given();
    staff.recipientsOf.mockResolvedValue(Result.ok(["s1", "s2"]));

    const result = await useCase.execute(
      event("admin.approval.requested", { approvalId: "a1", action: "ban", userId: "u2" }),
    );

    expect(result.isSuccess).toBe(true);
    expect(staff.recipientsOf.mock.calls[0]?.[1]).toEqual(STAFF);
    expect(fannedOut(fanouts)[0]?.recipients).toEqual({ kind: "listed", userIds: ["s1", "s2"] });
  });

  it("writes nothing and fails with the reader error when the staff audience cannot be read", async () => {
    const { fanouts, staff, useCase } = given();
    staff.recipientsOf.mockResolvedValue(
      Result.fail({
        code: "NOTIFICATION_STAFF_RECIPIENTS_PROVIDER_FAILURE",
        message: "database operation failed: recipientsOf",
      }),
    );

    const result = await useCase.execute(
      event("admin.approval.requested", { approvalId: "a1", action: "ban", userId: "u2" }),
    );

    expect(result.getError().code).toBe("NOTIFICATION_STAFF_RECIPIENTS_PROVIDER_FAILURE");
    expect(fannedOut(fanouts)).toEqual([]);
  });
});
