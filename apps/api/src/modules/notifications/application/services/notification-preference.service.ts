import { type Option, Result } from "@packages/ddd-kit";
import type {
  INotificationStore,
  NotificationChannel,
  NotificationError,
} from "../ports/notification.port";

export class NotificationPreferenceService {
  constructor(private readonly store: INotificationStore) {}

  async resolve(
    userId: string,
    organizationId: Option<string>,
    category: string,
    channel: NotificationChannel,
  ): Promise<Result<boolean, NotificationError>> {
    if (organizationId.isSome()) {
      const orgPreferences = await this.store.listPreferences("org", organizationId.unwrap());
      if (orgPreferences.isFailure) return Result.fail(orgPreferences.getError());
      const locked = orgPreferences
        .getValue()
        .find((p) => p.category === category && p.channel === channel && p.locked);
      if (locked) return Result.ok(locked.enabled);
    }

    const userPreferences = await this.store.listPreferences("user", userId);
    if (userPreferences.isFailure) return Result.fail(userPreferences.getError());
    const own = userPreferences
      .getValue()
      .find((p) => p.category === category && p.channel === channel);

    return Result.ok(own ? own.enabled : true);
  }
}
