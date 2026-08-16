import {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CHANNELS,
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
    const row = { category } as PreferenceRow;

    for (const channel of NOTIFICATION_CHANNELS) {
      const found = preferences.find(
        (preference) => preference.category === category && preference.channel === channel,
      );

      row[channel] = found
        ? {
            enabled: found.enabled,
            frequency: found.frequency,
            locked: found.locked,
            explicit: true,
          }
        : DEFAULT_CELL;
    }

    return row;
  });
}
