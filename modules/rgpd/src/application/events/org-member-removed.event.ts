import { EventTypes, type OrgMemberRemovedPayload } from "@packages/events";
import type { z } from "zod";

export interface MembershipErased {
  memberId: string;
  organizationId: string;
  erasedUserId: string;
}

export function orgMemberRemovedEvent(fact: MembershipErased) {
  const payload: z.infer<typeof OrgMemberRemovedPayload> = {
    organizationId: fact.organizationId,
    actorUserId: fact.erasedUserId,
    userId: fact.erasedUserId,
  };

  return {
    type: EventTypes.ORG_MEMBER_REMOVED,
    aggregateType: "member",
    aggregateId: fact.memberId,
    payload,
  };
}
