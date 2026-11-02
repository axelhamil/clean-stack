import { createSessionQueryOptions } from "@packages/web-kit/api/session-query";
import { authClient } from "../../auth/auth-client";
import { AUTH_QUERY_STALE_TIME_MS } from "../../auth/auth-stale-time";

type SessionData = NonNullable<Awaited<ReturnType<typeof authClient.getSession>>["data"]>;

export const sessionQueryOptions = createSessionQueryOptions<SessionData>({
  getSession: () => authClient.getSession(),
  staleTime: AUTH_QUERY_STALE_TIME_MS,
});
