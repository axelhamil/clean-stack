import { z } from "zod";

const domain = z
  .string()
  .min(3)
  .regex(/^[a-z0-9.-]+\.[a-z]{2,}$/i, "Enter a bare domain, without https:// or a path");

export const oidcProviderSchema = z.object({
  domain,
  issuer: z.string().url().startsWith("https://", "The issuer must be served over HTTPS"),
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
});
export type OidcProviderInput = z.infer<typeof oidcProviderSchema>;

export const samlProviderSchema = z.object({
  domain,
  entryPoint: z.string().url().startsWith("https://", "The entry point must be served over HTTPS"),
  issuer: z.string().min(1),
  cert: z.string().min(1, "Paste the IdP signing certificate"),
});
export type SamlProviderInput = z.infer<typeof samlProviderSchema>;
