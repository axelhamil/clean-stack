import { type EventHandler, type IDomainEvent, onEvent, Result } from "@packages/ddd-kit";
import { EventTypes, UserDeletedPayload } from "@packages/events";
import type { ApprovalService } from "../services/approval.service";

interface CloseApprovalsDeps {
  ApprovalService: ApprovalService;
}

export const closeApprovalsOfDeletedUser: (deps: CloseApprovalsDeps) => EventHandler = onEvent(
  EventTypes.USER_DELETED,
  "close-approvals-of-deleted-user",
  (c: CloseApprovalsDeps) => async (event: IDomainEvent) => {
    const parsed = UserDeletedPayload.safeParse(event.payload);
    if (!parsed.success) return Result.ok();

    return c.ApprovalService.closeForDeletedUser(parsed.data.userId);
  },
);
