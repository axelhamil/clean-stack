import { z } from "zod";

const PROBE_ORIGIN = "https://same-origin.invalid";

export function toSafeRedirect(value: string | undefined): string | undefined {
  if (!value?.startsWith("/")) return undefined;

  const parsed = URL.parse(value, PROBE_ORIGIN);
  if (parsed?.origin !== PROBE_ORIGIN) return undefined;

  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

export const redirectSearchSchema = z.object({
  redirect: z.string().optional().transform(toSafeRedirect).catch(undefined),
});
