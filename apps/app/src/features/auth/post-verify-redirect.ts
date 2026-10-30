import { toSafeRedirect } from "@packages/web-kit/auth/safe-redirect";

const STORAGE_KEY = "post-verify-redirect";

export function rememberPostVerifyRedirect(redirect: string | undefined): void {
  try {
    if (redirect) localStorage.setItem(STORAGE_KEY, redirect);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    return;
  }
}

export function takePostVerifyRedirect(): string | undefined {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_KEY);
    return toSafeRedirect(stored ?? undefined);
  } catch {
    return undefined;
  }
}
