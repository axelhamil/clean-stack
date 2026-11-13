import { EventTypes, type UserCookieConsentLinkedPayload } from "@packages/events";
import type { z } from "zod";

export type ConsentLinked = z.infer<typeof UserCookieConsentLinkedPayload>;

export function consentLinkedEvent(payload: ConsentLinked) {
  return {
    type: EventTypes.USER_COOKIE_CONSENT_LINKED,
    aggregateType: "user",
    aggregateId: payload.userId,
    payload,
  };
}
