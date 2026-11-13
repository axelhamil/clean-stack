import { describe, expect, it } from "bun:test";
import { Option, Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { enqueuedEvents } from "@packages/outbox/testing/enqueued-events";
import { mockPort } from "@packages/test/bun";
import type { AuditError } from "../../../application/ports/repositories/audit-log.port";
import type {
  AuditPage,
  IListAuditEventsQuery,
} from "../../../application/queries/list-audit-events.query";
import { ListAuditEventsUseCase } from "../../../application/usecases/list-audit-events/list-audit-events.usecase";

const PAGE: AuditPage = {
  items: [
    {
      id: "audit-1",
      action: "user.created",
      actorId: Option.some("user-1"),
      actorType: "user",
      organizationId: Option.some("org-1"),
      targetType: "user",
      targetId: "user-1",
      metadata: {},
      occurredAt: new Date("2024-01-01"),
      requestId: Option.none(),
      retention: "operational",
      prevHash: Option.none(),
      hash: Option.some("abc123"),
    },
  ],
  nextCursor: Option.some("next-page"),
};

function given() {
  const query = mockPort<IListAuditEventsQuery>();
  const outbox = mockPort<IOutboxRepository>();
  query.execute.mockResolvedValue(Result.ok(PAGE));
  outbox.enqueue.mockResolvedValue(undefined);

  return { query, outbox, useCase: new ListAuditEventsUseCase(query, outbox) };
}

describe("list audit events", () => {
  it("returns the page and records that an operator opened the audit log", async () => {
    const { useCase, outbox } = given();

    const result = await useCase.execute({
      filters: {
        actorId: "user-2",
        actionPrefix: "org.",
        organizationId: "org-2",
        occurredFrom: new Date("2026-01-01T00:00:00.000Z"),
        limit: 10,
      },
      actorUserId: "op-1",
      ip: "10.0.0.1",
    });

    expect(result.getValue()).toEqual(PAGE);
    expect(enqueuedEvents(outbox)).toEqual([
      {
        eventType: EventTypes.SECURITY_OPERATOR_AUDIT_ACCESSED,
        aggregateId: "platform",
        payload: {
          actorUserId: "op-1",
          ip: "10.0.0.1",
          filters: {
            actorId: "user-2",
            actionPrefix: "org.",
            organizationId: "org-2",
            occurredFrom: "2026-01-01T00:00:00.000Z",
            occurredTo: undefined,
          },
        },
      },
    ]);
  });

  it("records nothing when the operator only turns a page", async () => {
    const { useCase, outbox } = given();

    const result = await useCase.execute({
      filters: { cursor: "next-page" },
      actorUserId: "op-1",
      ip: "10.0.0.1",
    });

    expect(result.isSuccess).toBe(true);
    expect(enqueuedEvents(outbox)).toEqual([]);
  });

  it("fails without recording an access when the read fails", async () => {
    const { useCase, query, outbox } = given();
    const failure: AuditError = { code: "AUDIT_PERSISTENCE_PROVIDER_FAILURE", message: "db down" };
    query.execute.mockResolvedValue(Result.fail(failure));

    const result = await useCase.execute({ filters: {}, actorUserId: "op-1", ip: "10.0.0.1" });

    expect(result.getError()).toEqual(failure);
    expect(enqueuedEvents(outbox)).toEqual([]);
  });
});
