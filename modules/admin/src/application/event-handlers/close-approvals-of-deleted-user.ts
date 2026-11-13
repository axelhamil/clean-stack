import { dispatchTo, type EventHandler, type IUseCase, onEvent } from "@packages/ddd-kit";
import { EventTypes, PayloadByEventType } from "@packages/events";
import { payloadParser } from "@packages/outbox/payload-parser";
import type { CloseApprovalsOfDeletedUserInput } from "../usecases/close-approvals-of-deleted-user/close-approvals-of-deleted-user.dto";

interface CloseApprovalsDeps {
  CloseApprovalsOfDeletedUserUseCase: IUseCase<CloseApprovalsOfDeletedUserInput, void, unknown>;
}

const parsePayload = payloadParser(PayloadByEventType[EventTypes.USER_DELETED]);

export const closeApprovalsOfDeletedUser: (deps: CloseApprovalsDeps) => EventHandler = onEvent(
  EventTypes.USER_DELETED,
  "close-approvals-of-deleted-user",
  (c: CloseApprovalsDeps) =>
    dispatchTo(
      c.CloseApprovalsOfDeletedUserUseCase,
      ({ userId }: CloseApprovalsOfDeletedUserInput) => ({ userId }),
    ),
  { payload: parsePayload },
);
