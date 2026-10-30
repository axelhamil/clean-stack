export function signInUrl(appUrl: string, returnTo: string): string {
  return `${new URL(appUrl).origin}/sign-in?redirect=${encodeURIComponent(returnTo)}`;
}
