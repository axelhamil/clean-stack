/**
 * `z.url()` accepts any scheme, so the https requirement both the SSO and the
 * webhook forms state in their copy has to be a check of its own.
 */
export function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}
