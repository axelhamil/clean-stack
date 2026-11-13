import { EventTypes, type OrgDeletedPayload } from "@packages/events";
import type { z } from "zod";

export interface OrgDeletedByErasure {
  organizationId: string;
  erasedUserId: string;
}

export function orgDeletedEvent(fact: OrgDeletedByErasure) {
  const payload: z.infer<typeof OrgDeletedPayload> = {
    organizationId: fact.organizationId,
    actorUserId: fact.erasedUserId,
  };

  return {
    type: EventTypes.ORG_DELETED,
    aggregateType: "organization",
    aggregateId: fact.organizationId,
    payload,
  };
}
