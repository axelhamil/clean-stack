import { queryOptions } from "@tanstack/react-query";
import { errorFallback } from "../i18n/get-errors-t";
import { toAuthClientError } from "./errors/api-error";

interface SessionFailure {
  code?: string;
  status: number;
  message?: string;
}

interface SessionResponse<TSession> {
  data: TSession | null;
  error: SessionFailure | null;
}

interface SessionQueryConfig<TSession> {
  getSession: () => Promise<SessionResponse<TSession>>;
  staleTime: number;
}

export function createSessionQueryOptions<TSession>({
  getSession,
  staleTime,
}: SessionQueryConfig<TSession>) {
  return queryOptions({
    queryKey: ["session"] as const,
    queryFn: async (): Promise<TSession | null> => {
      const { data, error } = await getSession();

      if (error && error.status !== 401) {
        throw toAuthClientError(error, errorFallback("loadSession"));
      }

      return data ?? null;
    },
    staleTime,
  });
}
