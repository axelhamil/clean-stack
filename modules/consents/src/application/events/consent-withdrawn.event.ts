import { EventTypes, type UserCookieConsentWithdrawnPayload } from "@packages/events";

export function consentWithdrawnEvent(payload: UserCookieConsentWithdrawnPayload) {
  return {
    type: EventTypes.USER_COOKIE_CONSENT_WITHDRAWN,
    aggregateType: "user",
    aggregateId: payload.userId ?? payload.subjectId,
    payload,
  };
}
