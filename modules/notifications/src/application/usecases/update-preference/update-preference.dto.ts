import type { NotificationCategory } from "@packages/events";
import type {
  NotificationChannel,
  NotificationFrequency,
} from "../../ports/repositories/notification.port";

export interface PreferenceChoice {
  category: NotificationCategory;
  channel: NotificationChannel;
  enabled: boolean;
  frequency: NotificationFrequency;
}

export interface UpdatePreferenceInput extends PreferenceChoice {
  userId: string;
}
