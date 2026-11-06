import { Option } from "@packages/ddd-kit";
import { defineModule } from "inwire";
import type { ApiTokenSettings } from "../modules/api-token/application/config/api-token-settings";
import type { BillingSettings } from "../modules/billing/application/config/billing-settings";
import type { ConsentSettings } from "../modules/consents/application/config/consent-settings";
import type {
  S3StorageSettings,
  StorageSettings,
  UploadSettings,
} from "../modules/uploads/application/config/upload-settings";
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

  return defineModule<Record<never, never>>()((b) =>
    b
      .add("consentSettings", (): ConsentSettings => consentSettings)
      .add("apiTokenSettings", (): ApiTokenSettings => apiTokenSettings)
      .add("uploadSettings", (): UploadSettings => uploadSettings)
      .add("storageSettings", (): StorageSettings => storageSettings)
      .add("billingSettings", (): BillingSettings => billingSettings),
  );
};
