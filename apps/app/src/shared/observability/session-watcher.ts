import type { QueryClient } from "@tanstack/react-query";
import { setUser } from "./sentry";

type SessionLike = { user?: { id?: string } } | null | undefined;

export function watchSession(queryClient: QueryClient): () => void {
  let lastUserId: string | null | undefined;

  return queryClient.getQueryCache().subscribe((event) => {
    if (event.type !== "updated" && event.type !== "added") return;

    const { queryKey, state } = event.query;
    if (queryKey.length !== 1 || queryKey[0] !== "session") return;
    if (state.data === undefined) return;

    const userId = (state.data as SessionLike)?.user?.id ?? null;
    if (userId === lastUserId) return;
    lastUserId = userId;

    setUser(userId ? { id: userId } : null);
  });
}
