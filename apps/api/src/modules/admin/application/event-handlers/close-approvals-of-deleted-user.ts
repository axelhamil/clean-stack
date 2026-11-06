import { type EventHandler, type IDomainEvent, onEvent } from "@packages/ddd-kit";
import { EventTypes, PayloadByEventType } from "@packages/events";
import { payloadParser } from "../../../../shared/payload-parser";
import type { ApprovalService } from "../services/approval.service";

interface CloseApprovalsDeps {
  ApprovalService: ApprovalService;
}

const parsePayload = payloadParser(PayloadByEventType[EventTypes.USER_DELETED]);

export const closeApprovalsOfDeletedUser: (deps: CloseApprovalsDeps) => EventHandler = onEvent(
  EventTypes.USER_DELETED,
  "close-approvals-of-deleted-user",
  (c: CloseApprovalsDeps) => async (_event: IDomainEvent, payload) =>
    c.ApprovalService.closeForDeletedUser(payload.userId),
  { payload: parsePayload },
);
