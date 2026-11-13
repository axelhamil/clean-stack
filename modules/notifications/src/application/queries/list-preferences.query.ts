import type { IQuery } from "@packages/ddd-kit";
import type {
  NotificationError,
  PreferenceRecord,
  PreferenceScope,
} from "../ports/repositories/notification.port";

export type PreferencesRequest = {
  scope: PreferenceScope;
  scopeId: string;
};

export type IListPreferencesQuery = IQuery<
  PreferencesRequest,
  PreferenceRecord[],
  NotificationError
>;
