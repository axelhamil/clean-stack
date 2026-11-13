import { EventTypes, type UserCookieConsentGrantedPayload } from "@packages/events";

export function consentGrantedEvent(payload: UserCookieConsentGrantedPayload) {
  return {
    type: EventTypes.USER_COOKIE_CONSENT_GRANTED,
    aggregateType: "user",
    aggregateId: payload.userId ?? payload.subjectId,
    payload,
  };
}
