import type { AdminSettings } from "@modules/admin/config";
import type { StaffEnv } from "@modules/admin/rules/staff-access";
import type { ApiTokenSettings } from "@modules/api-token/config";
import type { AuditLogSettings } from "@modules/audit-log/config";
import type { BillingSettings } from "@modules/billing/config";
import type { ConsentSettings } from "@modules/consents/config";
import type { NotificationSettings } from "@modules/notifications/config";
import type { RgpdSettings } from "@modules/rgpd/config";
import type { S3StorageSettings, StorageSettings, UploadSettings } from "@modules/uploads/config";
import type { WebhookSettings } from "@modules/webhooks/config";
import { Option } from "@packages/ddd-kit";
import { defineModule } from "inwire";
import type { AuthSettings } from "../auth/deps";
import type { env } from "../shared/env";
import { frontOrigins } from "../shared/env-bounds";

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
  | "BETTER_AUTH_URL"
  | "BETTER_AUTH_SECRET"
  | "BETTER_AUTH_SECRETS"
  | "CORS_ORIGIN"
  | "ADMIN_URL"
  | "AUTH_COOKIE_DOMAIN"
  | "SCIM_CREDENTIAL_HASH_SECRET"
  | "AUTH_SIGN_IN_ACCOUNT_WINDOW_SEC"
  | "AUTH_SIGN_IN_ACCOUNT_MAX"
  | "DISPOSABLE_EMAIL_BLOCK_ENABLED"
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
  const authSettings: AuthSettings = {
    appUrl: source.APP_URL,
    adminUrl: source.ADMIN_URL,
    baseUrl: source.BETTER_AUTH_URL,
    secret: source.BETTER_AUTH_SECRET,
    secrets: source.BETTER_AUTH_SECRETS,
    cookieDomain: source.AUTH_COOKIE_DOMAIN,
    production: source.NODE_ENV === "production",
    trustedOrigins: frontOrigins(source),
    platformAdminIds: source.PLATFORM_ADMIN_IDS,
    stripeWebhookSecret: source.STRIPE_WEBHOOK_SECRET ?? "",
    scimCredentialHashSecret:
      source.SCIM_CREDENTIAL_HASH_SECRET ??
      "dev-only-scim-credential-secret-not-for-production-use",
    signInAccount: {
      windowSec: source.AUTH_SIGN_IN_ACCOUNT_WINDOW_SEC,
      maxRequests: source.AUTH_SIGN_IN_ACCOUNT_MAX,
    },
    disposableEmailBlockEnabled: source.DISPOSABLE_EMAIL_BLOCK_ENABLED,
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
      .add("notificationSettings", (): NotificationSettings => notificationSettings)
      .add("authSettings", (): AuthSettings => authSettings),
  );
};
