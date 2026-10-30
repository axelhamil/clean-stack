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

export function redirectQuery(authUrl: string): string {
  const path = toSameOriginPath(callbackParam(authUrl));
  if (!path || path === "/") return "";

  return `&redirect=${encodeURIComponent(path)}`;
}
