import type { QueryClient } from "@tanstack/react-query";

export function watchRefusals(
  queryClient: QueryClient,
  react: (error: unknown) => void,
): () => void {
  const unsubscribeQueries = queryClient.getQueryCache().subscribe((event) => {
    if (event.type === "updated" && event.action.type === "error") react(event.action.error);
  });
  const unsubscribeMutations = queryClient.getMutationCache().subscribe((event) => {
    if (event.type === "updated" && event.action.type === "error") react(event.action.error);
  });

  return () => {
    unsubscribeQueries();
    unsubscribeMutations();
  };
}
