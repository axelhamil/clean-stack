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

function hasUnsafePath(parsed: URL): boolean {
  return parsed.pathname.startsWith("//") || ENCODED_PATH_SEPARATOR.test(parsed.pathname);
}

function toAllowedExternal(value: string, externalOrigin: string): string | undefined {
  const allowed = parseAgainstProbe(externalOrigin);
  if (!allowed || allowed.origin === PROBE_ORIGIN) return undefined;
  if (value !== allowed.origin && !value.startsWith(`${allowed.origin}/`)) return undefined;

  const parsed = parseAgainstProbe(value);
  if (parsed?.origin !== allowed.origin) return undefined;
  if (parsed.username || parsed.password || hasUnsafePath(parsed)) return undefined;

  return `${parsed.origin}${parsed.pathname}${parsed.search}${parsed.hash}`;
}

export function toSafeRedirect(
  value: string | undefined,
  externalOrigin?: string,
): string | undefined {
  if (value && externalOrigin && !value.startsWith("/")) {
    return toAllowedExternal(value, externalOrigin);
  }
  if (!value?.startsWith("/")) return undefined;

  const parsed = parseAgainstProbe(value);
  if (parsed?.origin !== PROBE_ORIGIN || hasUnsafePath(parsed)) return undefined;

  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

export function isExternalRedirect(target: string): boolean {
  return !target.startsWith("/");
}

export function twoFactorPath(search: string, externalOrigin?: string): string {
  const redirect = toSafeRedirect(
    new URLSearchParams(search).get("redirect") ?? undefined,
    externalOrigin,
  );

  return redirect ? `/two-factor?redirect=${encodeURIComponent(redirect)}` : "/two-factor";
}

export function createRedirectSearchSchema(externalOrigin?: string) {
  return z.object({
    redirect: z
      .string()
      .optional()
      .transform((value) => toSafeRedirect(value, externalOrigin))
      .catch(undefined),
  });
}
