const PROBE_ORIGIN = "https://same-origin.invalid";

function callbackParam(authUrl: string): string | null {
  try {
    return new URL(authUrl).searchParams.get("callbackURL");
  } catch {
    return null;
  }
}

function toSameOriginPath(value: string | null): string | undefined {
  if (!value?.startsWith("/")) return undefined;

  try {
    const parsed = new URL(value, PROBE_ORIGIN);
    if (parsed.origin !== PROBE_ORIGIN || parsed.pathname.startsWith("//")) return undefined;

    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return undefined;
  }
}

function toAllowedExternal(value: string | null, externalOrigin?: string): string | undefined {
  if (!value || !externalOrigin) return undefined;
  if (value !== externalOrigin && !value.startsWith(`${externalOrigin}/`)) return undefined;

  try {
    const parsed = new URL(value);
    if (parsed.origin !== externalOrigin || parsed.username || parsed.password) return undefined;

    return `${parsed.origin}${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return undefined;
  }
}

export function redirectQuery(authUrl: string, externalOrigin?: string): string {
  const callback = callbackParam(authUrl);
  const target = toSameOriginPath(callback) ?? toAllowedExternal(callback, externalOrigin);
  if (!target || target === "/") return "";

  return `&redirect=${encodeURIComponent(target)}`;
}
