import { describe, expect, it } from "bun:test";
import { Option, Result } from "@packages/ddd-kit";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { enqueuedEvents } from "@packages/outbox/testing/enqueued-events";
import { mockPort } from "@packages/test/bun";
import { mockUnitOfWork } from "@packages/test/bun/unit-of-work";
import type { ISavedViewStore } from "../../../application/ports/repositories/saved-view-store.port";
import { DeleteViewUseCase } from "../../../application/usecases/delete-view/delete-view.usecase";

describe("DeleteViewUseCase", () => {
  it("answers not found and announces nothing when the view is not the actor's", async () => {
    const store = mockPort<ISavedViewStore>();
    store.remove.mockImplementation(async () => Result.ok(Option.none()));
    const outbox = mockPort<IOutboxRepository>();
    outbox.enqueue.mockImplementation(async () => {});
    const { unitOfWork } = mockUnitOfWork();

    const result = await new DeleteViewUseCase(store, outbox, unitOfWork).execute({
      actorUserId: "staff-2",
      viewId: "view-1",
    });

    expect(result.getError().code).toBe("ADMIN_VIEW_NOT_FOUND");
    expect(enqueuedEvents(outbox)).toEqual([]);
  });
});
