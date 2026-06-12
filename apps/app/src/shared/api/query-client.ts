import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { onMutationError, onQueryError } from "../observability/query-error-handler";

export const queryClient = new QueryClient({
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
