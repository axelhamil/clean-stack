import { useTranslation } from "react-i18next";
import { z } from "zod";

export const API_SCOPES = ["read:profile", "write:profile", "read:organizations"] as const;

/**
 * `EXPIRY_OPTIONS` used to be a module-level `as const` array, but its labels
 * are copy and `t` only exists inside a component — so the labels move into
 * a hook, called from `TokenForm`. Values stay put; only the labels move.
 * The 365-day option goes through the year plural (`expiryYears`, count: 1)
 * rather than the day plural, so it renders "1 year" the way the English
 * source always has — not "365 days".
 */
export function useExpiryOptions() {
  const { t } = useTranslation("settings");
  return [
    { label: t("apiTokens.expiryDays", { count: 30 }), value: 30 },
    { label: t("apiTokens.expiryDays", { count: 60 }), value: 60 },
    { label: t("apiTokens.expiryDays", { count: 90 }), value: 90 },
    { label: t("apiTokens.expiryYears", { count: 1 }), value: 365 },
    { label: t("apiTokens.expiryNever"), value: null },
  ] as const;
}

export const tokenFormSchema = z.object({
  name: z.string().min(1).max(100),
  scopes: z.array(z.enum(API_SCOPES)).min(1),
  organizationId: z.string().nullable(),
  expiresInDays: z.number().int().positive().nullable(),
});

export type TokenFormInput = z.infer<typeof tokenFormSchema>;
