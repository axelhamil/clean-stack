import { describe, expect, it } from "bun:test";
import { Option, Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { enqueuedEvents } from "@packages/outbox/testing/enqueued-events";
import { mockPort } from "@packages/test/bun";
import { mockUnitOfWork } from "@packages/test/bun/unit-of-work";
import type { ISavedViewStore } from "../application/ports/saved-view-store.port";
import { SavedViewService } from "../application/services/saved-view.service";

const VIEW = { screen: "users", name: "Suspended", filters: { status: "suspended" } } as const;

function setup() {
  const store = mockPort<ISavedViewStore>();
  store.save.mockImplementation(async () => Result.ok("view-1"));
  store.list.mockImplementation(async () => Result.ok([]));
  store.remove.mockImplementation(async () =>
    Result.ok(Option.some({ id: "view-1", screen: "users" })),
  );

  const outbox = mockPort<IOutboxRepository>();
  outbox.enqueue.mockImplementation(async () => {});

  const { unitOfWork } = mockUnitOfWork();

  return { store, outbox, service: new SavedViewService(store, outbox, unitOfWork) };
}

describe("SavedViewService", () => {
  it("announces a saved view without its name or filters", async () => {
    const { service, outbox } = setup();

    await service.save({ actorUserId: "staff-1", permissions: ["users.read"], view: VIEW });

    const [event] = enqueuedEvents(outbox);
    expect(event?.eventType).toBe(EventTypes.ADMIN_VIEW_SAVED);
    expect(event?.payload).toEqual({ actorUserId: "staff-1", viewId: "view-1", screen: "users" });
  });

  it("refuses a view on a screen the permissions do not open", async () => {
    const { service, store } = setup();

    const result = await service.save({
      actorUserId: "staff-1",
      permissions: ["audit.read"],
      view: VIEW,
    });

    expect(result.getError().code).toBe("ADMIN_STAFF_PERMISSION_FORBIDDEN");
    expect(store.save).not.toHaveBeenCalled();
  });

  it("answers not found and announces nothing when the view is not the actor's", async () => {
    const { service, store, outbox } = setup();
    store.remove.mockImplementation(async () => Result.ok(Option.none()));

    const result = await service.remove({ actorUserId: "staff-2", viewId: "view-1" });

    expect(result.getError().code).toBe("ADMIN_VIEW_NOT_FOUND");
    expect(enqueuedEvents(outbox)).toEqual([]);
  });

  it("reads only the screens the permissions open", async () => {
    const { service, store } = setup();

    await service.list({ ownerId: "staff-1", permissions: ["audit.read"] });

    expect(store.list.mock.calls[0]?.[1]).toEqual(["audit"]);
  });
});
