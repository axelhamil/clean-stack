import { EventTypes, type UserPolicyAcceptedPayload } from "@packages/events";
import type { PolicyType } from "@packages/policies";
import type { z } from "zod";

export interface PolicyAccepted {
  userId: string;
  policyType: PolicyType;
  policyVersion: string;
  ipAddress: string | undefined;
}

export function policyAcceptedEvent(fact: PolicyAccepted) {
  const payload: z.infer<typeof UserPolicyAcceptedPayload> = {
    userId: fact.userId,
    policyType: fact.policyType,
    policyVersion: fact.policyVersion,
    ipAddress: fact.ipAddress,
  };

  return {
    type: EventTypes.USER_POLICY_ACCEPTED,
    aggregateType: "user",
    aggregateId: fact.userId,
    payload,
  };
}
