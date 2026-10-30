import { z } from "zod";

const PROBE_ORIGIN = "https://same-origin.invalid";
const ENCODED_PATH_SEPARATOR = /%2f|%5c/i;

function parseAgainstProbe(value: string): URL | undefined {
  try {
    return new URL(value, PROBE_ORIGIN);
  } catch {
    return undefined;
  }
}

export function toSafeRedirect(value: string | undefined): string | undefined {
  if (!value?.startsWith("/")) return undefined;

  const parsed = parseAgainstProbe(value);
  if (parsed?.origin !== PROBE_ORIGIN) return undefined;
  if (parsed.pathname.startsWith("//")) return undefined;
  if (ENCODED_PATH_SEPARATOR.test(parsed.pathname)) return undefined;

  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

export function twoFactorPath(search: string): string {
  const redirect = toSafeRedirect(new URLSearchParams(search).get("redirect") ?? undefined);

  return redirect ? `/two-factor?redirect=${encodeURIComponent(redirect)}` : "/two-factor";
}

export const redirectSearchSchema = z.object({
  redirect: z.string().optional().transform(toSafeRedirect).catch(undefined),
});
