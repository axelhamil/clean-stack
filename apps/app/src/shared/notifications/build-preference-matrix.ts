import {
  NOTIFICATION_CATEGORIES,
  type NotificationCategory,
  type NotificationChannel,
  type NotificationFrequency,
} from "@packages/events";
import type { NotificationPreference } from "../api/queries/notifications";

export type PreferenceCell = {
  enabled: boolean;
  frequency: NotificationFrequency;
  locked: boolean;
  explicit: boolean;
};

export type PreferenceRow = Record<NotificationChannel, PreferenceCell> & {
  category: NotificationCategory;
};

const DEFAULT_CELL: PreferenceCell = {
  enabled: true,
  frequency: "immediate",
  locked: false,
  explicit: false,
};

export function buildPreferenceMatrix(preferences: NotificationPreference[]): PreferenceRow[] {
  return NOTIFICATION_CATEGORIES.map((category) => {
    const cellFor = (channel: NotificationChannel): PreferenceCell => {
      const found = preferences.find(
        (preference) => preference.category === category && preference.channel === channel,
      );

      return found
        ? {
            enabled: found.enabled,
            frequency: found.frequency,
            locked: found.locked,
            explicit: true,
          }
        : DEFAULT_CELL;
    };

    return { category, in_app: cellFor("in_app"), email: cellFor("email") };
  });
}
