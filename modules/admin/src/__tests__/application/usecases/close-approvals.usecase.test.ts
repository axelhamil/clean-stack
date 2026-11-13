import { describe, expect, it } from "bun:test";
import { Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import { approvalSetup, PENDING, REF } from "../../fixtures/approval-setup";

describe("CancelApprovalUseCase", () => {
  it("lets the requester withdraw and announces it", async () => {
    const { cancel, uow } = approvalSetup();

    const result = await cancel.execute({ approvalId: "a1", userId: "requester" });

    expect(result.isSuccess).toBe(true);
    expect(uow.writtenEvents().map((e) => [e.eventType, e.payload])).toEqual([
      [EventTypes.ADMIN_APPROVAL_CANCELLED, { ...REF, actorUserId: "requester" }],
    ]);
  });

  it("hides a colleague's request behind not found", async () => {
    const { cancel, store } = approvalSetup();

    const result = await cancel.execute({ approvalId: "a1", userId: "someone" });

    expect(result.getError().code).toBe("ADMIN_APPROVAL_NOT_FOUND");
    expect(store.cancel).not.toHaveBeenCalled();
  });

  it("refuses to withdraw a request already decided", async () => {
    const { cancel, store } = approvalSetup({ found: { ...PENDING, status: "executed" } });

    const result = await cancel.execute({ approvalId: "a1", userId: "requester" });

    expect(result.getError().code).toBe("ADMIN_APPROVAL_DECIDED_CONFLICT");
    expect(store.cancel).not.toHaveBeenCalled();
  });
});

describe("CloseApprovalsOfDeletedUserUseCase", () => {
  it("cancels the open requests with an event that names no actor", async () => {
    const { closeForDeletedUser, store, uow } = approvalSetup();
    store.closeForDeletedUser.mockImplementation(async () => Result.ok([PENDING]));

    const result = await closeForDeletedUser.execute({ userId: "target" });

    expect(result.isSuccess).toBe(true);
    expect(store.closeForDeletedUser).toHaveBeenCalledWith("target");
    expect(uow.writtenEvents().map((e) => [e.eventType, e.payload])).toEqual([
      [EventTypes.ADMIN_APPROVAL_CANCELLED, { ...REF, actorUserId: null }],
    ]);
  });
});

describe("ExpireApprovalsUseCase", () => {
  it("announces each expired request with no actor", async () => {
    const { expire, store, uow } = approvalSetup();

    const result = await expire.execute({ batchSize: 10 });

    expect(result.getValue()).toBe(1);
    expect(store.expireDue).toHaveBeenCalledWith(10);
    expect(uow.writtenEvents().map((e) => [e.eventType, e.payload])).toEqual([
      [EventTypes.ADMIN_APPROVAL_EXPIRED, { ...REF, actorUserId: null }],
    ]);
  });
});
