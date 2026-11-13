import { type IUnitOfWork, type IUseCase, Option, Result } from "@packages/ddd-kit";
import { type NotificationConfig, notificationConfigOf } from "@packages/events";
import type { StaffAudienceSettings } from "../../config/notification-settings";
import type {
  EmailDueAt,
  FanoutRecipients,
  INotificationFanoutRepository,
} from "../../ports/repositories/notification-fanout.port";
import type {
  IStaffRecipientsReader,
  StaffRecipientsError,
} from "../../ports/services/staff-recipients.port";
import { digestDueAt } from "../../services/digest-schedule.service";
import { type AudienceTarget, resolveAudience } from "../../services/resolve-audience.service";
import type { FanOutNotificationError, FanOutNotificationInput } from "./fan-out-notification.dto";

export interface FanOutNotificationSettings {
  digestHourUtc: number;
  staff: StaffAudienceSettings;
}

function dedupKeyOf(input: FanOutNotificationInput, window: NotificationConfig["dedupWindow"]) {
  if (!window) return `event:${input.eventId}`;

  const iso = input.occurredAt.toISOString();
  const bucket = window === "hour" ? iso.slice(0, 13) : iso.slice(0, 10);

  return `${input.eventType}:${input.aggregateId}:${bucket}`;
}

export class FanOutNotificationUseCase
  implements IUseCase<FanOutNotificationInput, void, FanOutNotificationError>
{
  constructor(
    private readonly fanouts: INotificationFanoutRepository,
    private readonly staffRecipients: IStaffRecipientsReader,
    private readonly uow: IUnitOfWork,
    private readonly settings: FanOutNotificationSettings,
  ) {}

  async execute(input: FanOutNotificationInput): Promise<Result<void, FanOutNotificationError>> {
    const config = notificationConfigOf(input.eventType);
    if (!config) return Result.ok();

    const audience = resolveAudience(config.audience, input);
    if (audience.isNone()) return Result.ok();

    const target = audience.unwrap();

    return this.uow.run(async (): Promise<Result<void, FanOutNotificationError>> => {
      const recipients = await this.recipientsOf(target);
      if (recipients.isFailure) return Result.fail(recipients.getError());

      return this.fanouts.fanOut({
        recipients: recipients.getValue(),
        organizationId: input.organizationId,
        category: config.category,
        eventType: input.eventType,
        groupKey: config.groupBy
          ? Option.some(`${input.eventType}:${input.aggregateId}`)
          : Option.none(),
        dedupKey: dedupKeyOf(input, config.dedupWindow),
        payload: input.payload,
        forced: config.forced === true,
        emailDueAt: this.emailDueAt(input.occurredAt),
      });
    });
  }

  private async recipientsOf(
    target: AudienceTarget,
  ): Promise<Result<FanoutRecipients, StaffRecipientsError>> {
    if (target.kind !== "staff") return Result.ok(target);

    const staff = await this.staffRecipients.recipientsOf(target, this.settings.staff);
    if (staff.isFailure) return Result.fail(staff.getError());

    return Result.ok({ kind: "listed", userIds: staff.getValue() });
  }

  private emailDueAt(occurredAt: Date): EmailDueAt {
    const hour = this.settings.digestHourUtc;

    return {
      immediate: digestDueAt(occurredAt, "immediate", hour),
      hourly: digestDueAt(occurredAt, "hourly", hour),
      daily: digestDueAt(occurredAt, "daily", hour),
    };
  }
}
