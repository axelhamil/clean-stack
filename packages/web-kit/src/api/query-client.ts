import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import type { CaptureError } from "../observability/capture-error";
import { createQueryErrorHandlers } from "../observability/query-error-handler";

export function createQueryClient(captureError: CaptureError): QueryClient {
  const { onQueryError, onMutationError } = createQueryErrorHandlers(captureError);

  return new QueryClient({
    queryCache: new QueryCache({ onError: onQueryError }),
    mutationCache: new MutationCache({ onError: onMutationError }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  });
}
