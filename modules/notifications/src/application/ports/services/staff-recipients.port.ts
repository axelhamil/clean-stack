import type { StaffPermission } from "@packages/access-control";
import type { AppError, Option, Result } from "@packages/ddd-kit";
import type { StaffAudienceSettings } from "../../config/notification-settings";

export type { StaffAudienceSettings };

export type StaffAudienceTarget = {
  kind: "staff";
  permission: StaffPermission;
  requesterUserId: Option<string>;
  actorUserId: Option<string>;
  subjectUserId: Option<string>;
};

export type StaffRecipientsError = AppError<"NOTIFICATION_STAFF_RECIPIENTS_PROVIDER_FAILURE">;

export interface IStaffRecipientsReader {
  recipientsOf(
    target: StaffAudienceTarget,
    settings: StaffAudienceSettings,
  ): Promise<Result<string[], StaffRecipientsError>>;
}
