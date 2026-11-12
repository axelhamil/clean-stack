const PROBE_ORIGIN = "https://same-origin.invalid";
const ENCODED_PATH_SEPARATOR = /%2f|%5c/i;

function callbackParam(authUrl: string): string | null {
  try {
    return new URL(authUrl).searchParams.get("callbackURL");
  } catch {
    return null;
  }
}

function hasUnsafePath(parsed: URL): boolean {
  return parsed.pathname.startsWith("//") || ENCODED_PATH_SEPARATOR.test(parsed.pathname);
}

function toSameOriginPath(value: string | null): string | undefined {
  if (!value?.startsWith("/")) return undefined;

  const parsed = URL.parse(value, PROBE_ORIGIN);
  if (parsed?.origin !== PROBE_ORIGIN || hasUnsafePath(parsed)) return undefined;

  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

function toAllowedExternal(value: string | null, externalOrigin?: string): string | undefined {
  if (!value || !externalOrigin) return undefined;
  if (value !== externalOrigin && !value.startsWith(`${externalOrigin}/`)) return undefined;

  const parsed = URL.parse(value);
  if (parsed?.origin !== externalOrigin) return undefined;
  if (parsed.username || parsed.password || hasUnsafePath(parsed)) return undefined;

  return `${parsed.origin}${parsed.pathname}${parsed.search}${parsed.hash}`;
}

export function redirectQuery(authUrl: string, externalOrigin?: string): string {
  const callback = callbackParam(authUrl);
  const target = toSameOriginPath(callback) ?? toAllowedExternal(callback, externalOrigin);
  if (!target || target === "/") return "";

  return `&redirect=${encodeURIComponent(target)}`;
}
