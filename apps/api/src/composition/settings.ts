import type { ApiTokenSettings } from "@modules/api-token/application/config/api-token-settings";
import type { AuditLogSettings } from "@modules/audit-log/application/config/audit-log-settings";
import type { BillingSettings } from "@modules/billing/application/config/billing-settings";
import type { ConsentSettings } from "@modules/consents/application/config/consent-settings";
import type { NotificationSettings } from "@modules/notifications/application/config/notification-settings";
import type { RgpdSettings } from "@modules/rgpd/application/config/rgpd-settings";
import type {
  S3StorageSettings,
  StorageSettings,
  UploadSettings,
} from "@modules/uploads/application/config/upload-settings";
import type { WebhookSettings } from "@modules/webhooks/application/config/webhook-settings";
import { Option } from "@packages/ddd-kit";
import { defineModule } from "inwire";
import type { AdminSettings } from "../modules/admin/application/config/admin-settings";
import type { StaffEnv } from "../modules/admin/application/services/staff-access";
import type { env } from "../shared/env";

type SettingsSource = Pick<
  typeof env,
  | "NODE_ENV"
  | "API_TOKEN_PREFIX"
  | "API_TOKEN_PEPPER"
  | "API_TOKEN_PEPPER_VERSION"
  | "API_TOKEN_PEPPER_PREVIOUS"
  | "API_TOKEN_MAX_EXPIRY_DAYS"
  | "STORAGE_MAX_UPLOAD_BYTES"
  | "STORAGE_PRESIGN_TTL_MIN_SECONDS"
  | "STORAGE_PRESIGN_TTL_MAX_SECONDS"
  | "S3_ENDPOINT"
  | "S3_ACCESS_KEY"
  | "S3_SECRET_KEY"
  | "S3_BUCKET"
  | "S3_PUBLIC_URL"
  | "S3_REGION"
  | "S3_FORCE_PATH_STYLE"
  | "STRIPE_SECRET_KEY"
  | "STRIPE_WEBHOOK_SECRET"
  | "APP_URL"
  | "SWEEP_DEADLINE_MS"
  | "RGPD_GRACE_PERIOD_DAYS"
  | "RGPD_EXPORT_RATE_LIMIT_HOURS"
  | "RGPD_SWEEP_BATCH_SIZE"
  | "WEBHOOK_MASTER_KEY"
  | "WEBHOOK_SECRET_GRACE_HOURS"
  | "WEBHOOK_LEASE_SECONDS"
  | "WEBHOOK_DEAD_RETRY_HOURS"
  | "WEBHOOK_AUTO_DISABLE_MIN_FAILURES"
  | "WEBHOOK_AUTO_DISABLE_AFTER_DAYS"
  | "WEBHOOK_RESPONSE_CAPTURE_BYTES"
  | "PLATFORM_ADMIN_IDS"
  | "PLATFORM_ADMIN_REQUIRE_MFA"
  | "ADMIN_STEP_UP_TTL_SECONDS"
  | "ADMIN_APPROVAL_ENABLED"
  | "ADMIN_APPROVAL_ACTIONS"
  | "ADMIN_APPROVAL_TTL_HOURS"
  | "OUTBOX_LEASE_SECONDS"
  | "AUDIT_TAMPER_EVIDENCE"
  | "NOTIFICATION_DIGEST_HOUR_UTC"
  | "DATABASE_URL"
>;

function storageSettingsOf(source: SettingsSource): StorageSettings {
  const { S3_ENDPOINT: endpoint, S3_ACCESS_KEY: accessKey, S3_SECRET_KEY: secretKey } = source;
  if (!endpoint || !accessKey || !secretKey) return Option.none();

  const s3: S3StorageSettings = {
    endpoint,
    accessKey,
    secretKey,
    bucket: source.S3_BUCKET ?? "clean-stack",
    publicUrl: source.S3_PUBLIC_URL ?? "",
    region: source.S3_REGION ?? "auto",
    forcePathStyle: source.S3_FORCE_PATH_STYLE,
    production: source.NODE_ENV === "production",
  };

  return Option.some(s3);
}

export const apiSettings = (source: SettingsSource) => {
  const consentSettings: ConsentSettings = { secureCookie: source.NODE_ENV === "production" };
  const apiTokenSettings: ApiTokenSettings = {
    prefix: source.API_TOKEN_PREFIX,
    pepper: source.API_TOKEN_PEPPER ?? "dev-only-pepper-not-for-production-use",
    pepperVersion: source.API_TOKEN_PEPPER_VERSION,
    pepperPrevious: Option.fromNullable(source.API_TOKEN_PEPPER_PREVIOUS),
    maxExpiryDays: source.API_TOKEN_MAX_EXPIRY_DAYS,
  };
  const uploadSettings: UploadSettings = {
    maxUploadBytes: source.STORAGE_MAX_UPLOAD_BYTES ?? 50 * 1024 * 1024,
    presignTtlMinSeconds: source.STORAGE_PRESIGN_TTL_MIN_SECONDS,
    presignTtlMaxSeconds: source.STORAGE_PRESIGN_TTL_MAX_SECONDS,
  };
  const storageSettings = storageSettingsOf(source);
  const billingSettings: BillingSettings = {
    stripeSecretKey: Option.fromNullable(source.STRIPE_SECRET_KEY),
    stripeWebhookSecret: Option.fromNullable(source.STRIPE_WEBHOOK_SECRET),
  };
  const webhookSettings: WebhookSettings = {
    masterKeyHex: Option.fromNullable(source.WEBHOOK_MASTER_KEY),
    secretGraceHours: source.WEBHOOK_SECRET_GRACE_HOURS,
    delivery: {
      leaseSeconds: source.WEBHOOK_LEASE_SECONDS,
      deadRetrySeconds: source.WEBHOOK_DEAD_RETRY_HOURS * 3600,
      autoDisableMinFailures: source.WEBHOOK_AUTO_DISABLE_MIN_FAILURES,
      autoDisableAfterDays: source.WEBHOOK_AUTO_DISABLE_AFTER_DAYS,
      responseCaptureBytes: source.WEBHOOK_RESPONSE_CAPTURE_BYTES,
      httpsOnly: source.NODE_ENV === "production",
    },
  };
  const rgpdSettings: RgpdSettings = {
    appUrl: source.APP_URL,
    gracePeriodDays: source.RGPD_GRACE_PERIOD_DAYS,
    exportRateLimitHours: source.RGPD_EXPORT_RATE_LIMIT_HOURS,
    sweepDeadlineMs: source.SWEEP_DEADLINE_MS,
    sweepBatchSize: source.RGPD_SWEEP_BATCH_SIZE,
  };
  const staffSettings: StaffEnv = {
    PLATFORM_ADMIN_IDS: source.PLATFORM_ADMIN_IDS,
    PLATFORM_ADMIN_REQUIRE_MFA: source.PLATFORM_ADMIN_REQUIRE_MFA,
  };
  const adminSettings: AdminSettings = {
    stepUpTtlSeconds: source.ADMIN_STEP_UP_TTL_SECONDS,
    approvalEnabled: source.ADMIN_APPROVAL_ENABLED,
    approvalActions: source.ADMIN_APPROVAL_ACTIONS,
    approvalTtlHours: source.ADMIN_APPROVAL_TTL_HOURS,
    outboxLeaseSeconds: source.OUTBOX_LEASE_SECONDS,
    supportUrl: `${source.APP_URL}/support`,
  };
  const auditLogSettings: AuditLogSettings = { tamperEvidence: source.AUDIT_TAMPER_EVIDENCE };
  const notificationSettings: NotificationSettings = {
    digestHourUtc: source.NOTIFICATION_DIGEST_HOUR_UTC,
    databaseUrl: source.DATABASE_URL,
  };

  return defineModule<Record<never, never>>()((b) =>
    b
      .add("consentSettings", (): ConsentSettings => consentSettings)
      .add("apiTokenSettings", (): ApiTokenSettings => apiTokenSettings)
      .add("uploadSettings", (): UploadSettings => uploadSettings)
      .add("storageSettings", (): StorageSettings => storageSettings)
      .add("billingSettings", (): BillingSettings => billingSettings)
      .add("webhookSettings", (): WebhookSettings => webhookSettings)
      .add("rgpdSettings", (): RgpdSettings => rgpdSettings)
      .add("staffSettings", (): StaffEnv => staffSettings)
      .add("adminSettings", (): AdminSettings => adminSettings)
      .add("auditLogSettings", (): AuditLogSettings => auditLogSettings)
      .add("notificationSettings", (): NotificationSettings => notificationSettings),
  );
};
