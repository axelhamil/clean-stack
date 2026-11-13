import { describe, expect, it } from "bun:test";
import { Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { enqueuedEvents } from "@packages/outbox/testing/enqueued-events";
import { mockPort } from "@packages/test/bun";
import { mockUnitOfWork } from "@packages/test/bun/unit-of-work";
import type { ISavedViewStore } from "../../../application/ports/repositories/saved-view-store.port";
import { SaveViewUseCase } from "../../../application/usecases/save-view/save-view.usecase";

const VIEW = { screen: "users", name: "Suspended", filters: { status: "suspended" } } as const;

function setup() {
  const store = mockPort<ISavedViewStore>();
  store.save.mockImplementation(async () => Result.ok("view-1"));

  const outbox = mockPort<IOutboxRepository>();
  outbox.enqueue.mockImplementation(async () => {});

  const { unitOfWork } = mockUnitOfWork();

  return { store, outbox, useCase: new SaveViewUseCase(store, outbox, unitOfWork) };
}

describe("SaveViewUseCase", () => {
  it("announces a saved view without its name or filters", async () => {
    const { useCase, outbox } = setup();

    await useCase.execute({ actorUserId: "staff-1", permissions: ["users.read"], view: VIEW });

    const [event] = enqueuedEvents(outbox);
    expect(event?.eventType).toBe(EventTypes.ADMIN_VIEW_SAVED);
    expect(event?.payload).toEqual({ actorUserId: "staff-1", viewId: "view-1", screen: "users" });
  });

  it("refuses a view on a screen the permissions do not open", async () => {
    const { useCase, store } = setup();

    const result = await useCase.execute({
      actorUserId: "staff-1",
      permissions: ["audit.read"],
      view: VIEW,
    });

    expect(result.getError().code).toBe("ADMIN_STAFF_PERMISSION_FORBIDDEN");
    expect(store.save).not.toHaveBeenCalled();
  });
});
