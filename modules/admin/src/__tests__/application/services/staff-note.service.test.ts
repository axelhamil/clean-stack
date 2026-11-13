import { describe, expect, it } from "bun:test";
import { Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { enqueuedEvents } from "@packages/outbox/testing/enqueued-events";
import { mockPort } from "@packages/test/bun";
import { mockUnitOfWork } from "@packages/test/bun/unit-of-work";
import type { IStaffNoteStore } from "../../../application/ports/repositories/staff-note-store.port";
import { StaffNoteService } from "../../../application/services/staff-note.service";

function setup(subjectExists = true) {
  const store = mockPort<IStaffNoteStore>();
  store.lockSubject.mockImplementation(async () => Result.ok(subjectExists));
  store.insert.mockImplementation(async () => Result.ok());

  const outbox = mockPort<IOutboxRepository>();
  outbox.enqueue.mockImplementation(async () => {});

  const { unitOfWork } = mockUnitOfWork();

  return { outbox, store, service: new StaffNoteService(store, outbox, unitOfWork) };
}

describe("StaffNoteService", () => {
  it("announces a note with ids only, never its body", async () => {
    const { service, outbox } = setup();

    await service.add({
      actorUserId: "staff-1",
      subject: { type: "org", id: "org-1" },
      body: "Called about the invoice",
    });

    const [event] = enqueuedEvents(outbox);
    expect(event?.eventType).toBe(EventTypes.ADMIN_NOTE_ADDED);
    expect(event?.payload).toMatchObject({
      actorUserId: "staff-1",
      subjectType: "org",
      subjectId: "org-1",
    });
    expect(JSON.stringify(event?.payload)).not.toContain("invoice");
  });

  for (const [type, code] of [
    ["user", "ADMIN_USER_NOT_FOUND"],
    ["org", "ADMIN_ORG_NOT_FOUND"],
  ] as const) {
    it(`refuses a note on a ${type} that is gone or erased`, async () => {
      const { service, store } = setup(false);

      const result = await service.add({
        actorUserId: "staff-1",
        subject: { type, id: "gone" },
        body: "x",
      });

      expect(result.getError().code).toBe(code);
      expect(store.insert).not.toHaveBeenCalled();
    });
  }
});
