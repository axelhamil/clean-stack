import type { SessionCookies } from "../../../../application/ports/services/auth-provider.port";

export function relaySetCookie(cookies: SessionCookies, to: Response): Response {
  for (const cookie of cookies) {
    to.headers.append("set-cookie", cookie);
  }
  return to;
}
