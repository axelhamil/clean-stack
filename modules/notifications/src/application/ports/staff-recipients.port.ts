import type { AppError, Result } from "@packages/ddd-kit";
import type { StaffAudienceSettings } from "../config/notification-settings";
import type { AudienceTarget } from "../services/resolve-audience";

export type { StaffAudienceSettings };

export type StaffAudienceTarget = Extract<AudienceTarget, { kind: "staff" }>;

export type StaffRecipientsError = AppError<"NOTIFICATION_STAFF_RECIPIENTS_PROVIDER_FAILURE">;

export interface IStaffRecipientsReader {
  recipientsOf(
    target: StaffAudienceTarget,
    settings: StaffAudienceSettings,
  ): Promise<Result<string[], StaffRecipientsError>>;
}
