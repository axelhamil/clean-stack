import type { Option } from "@packages/ddd-kit";
import { EventTypes, type UserLocaleChangedPayload } from "@packages/events";
import type { Locale } from "@packages/i18n";
import type { z } from "zod";

export interface UserLocaleChanged {
  userId: string;
  locale: Locale;
  previousLocale: Option<Locale>;
}

export function userLocaleChangedEvent(fact: UserLocaleChanged) {
  const payload: z.infer<typeof UserLocaleChangedPayload> = {
    userId: fact.userId,
    locale: fact.locale,
    previousLocale: fact.previousLocale.toNull(),
  };

  return {
    type: EventTypes.USER_LOCALE_CHANGED,
    aggregateType: "user",
    aggregateId: fact.userId,
    payload,
  };
}
