import { EventTypes, type UserProfileUpdatedPayload } from "@packages/events";
import type { z } from "zod";

export interface UserDisplayNameUpdated {
  userId: string;
  name: string;
}

export function userProfileUpdatedEvent(fact: UserDisplayNameUpdated) {
  const payload: z.infer<typeof UserProfileUpdatedPayload> = {
    userId: fact.userId,
    changes: { name: fact.name },
  };

  return {
    type: EventTypes.USER_PROFILE_UPDATED,
    aggregateType: "user",
    aggregateId: fact.userId,
    payload,
  };
}
