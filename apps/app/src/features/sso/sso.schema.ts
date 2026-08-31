import { z } from "zod";
import { isHttpsUrl } from "../../shared/api/is-https-url";

const BARE_DOMAIN = /^[a-z0-9.-]+\.[a-z]{2,}$/i;

// `.regex()` and `.startsWith()` raise `invalid_format`, which the global map can
// only answer generically. `.refine()` raises `custom`, which is the branch that
// carries `params.i18nKey` back to the catalog.
const domain = z
  .string()
  .min(3)
  .refine((v) => BARE_DOMAIN.test(v), { params: { i18nKey: "validation.bareDomain" } });

export const oidcProviderSchema = z.object({
  domain,
  issuer: z.url().refine(isHttpsUrl, { params: { i18nKey: "validation.httpsUrl" } }),
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
});
export type OidcProviderInput = z.infer<typeof oidcProviderSchema>;

export const samlProviderSchema = z.object({
  domain,
  entryPoint: z.url().refine(isHttpsUrl, { params: { i18nKey: "validation.httpsUrl" } }),
  issuer: z.string().min(1),
  cert: z.string().min(1),
});
export type SamlProviderInput = z.infer<typeof samlProviderSchema>;
