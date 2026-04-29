import { queryOptions } from "@tanstack/react-query";
import { authClient } from "../auth-client";

type SessionData = NonNullable<
  Awaited<ReturnType<typeof authClient.getSession>>["data"]
>;

export const sessionQueryOptions = queryOptions({
  queryKey: ["session"] as const,
  queryFn: async (): Promise<SessionData | null> => {
    const { data } = await authClient.getSession();
    return data ?? null;
  },
  staleTime: 5 * 60 * 1000,
});
