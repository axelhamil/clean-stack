import { CONSENT_COOKIE_NAME, OPTIONAL_CATEGORIES } from "@packages/cookie-consent";
import { z } from "zod";

export const recordConsentBodySchema = z.object({
  categories: z.array(z.enum(OPTIONAL_CATEGORIES)).default([]),
});

export const consentCookieSchema = z.object({
  [CONSENT_COOKIE_NAME]: z.uuid().optional().catch(undefined),
});

export const USER_AGENT_MAX_LENGTH = 512;

export const userAgentHeaderSchema = z.object({
  "user-agent": z
    .string()
    .transform((value) => value.slice(0, USER_AGENT_MAX_LENGTH))
    .optional(),
});

export type ConsentCookieSchema = typeof consentCookieSchema;
export type UserAgentHeaderSchema = typeof userAgentHeaderSchema;

export interface BrowserCookieInput {
  out: { cookie: z.output<ConsentCookieSchema> };
}

export interface BrowserHeaderInput {
  out: { header: z.output<UserAgentHeaderSchema> };
}
