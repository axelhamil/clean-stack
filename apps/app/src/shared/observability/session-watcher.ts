import type { QueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { setUser } from "./sentry";

const sessionUserSchema = z.object({ user: z.object({ id: z.string() }) });

export function watchSession(queryClient: QueryClient): () => void {
  let lastUserId: string | null | undefined;

  return queryClient.getQueryCache().subscribe((event) => {
    if (event.type !== "updated" && event.type !== "added") return;

    const { queryKey, state } = event.query;
    if (queryKey.length !== 1 || queryKey[0] !== "session") return;
    if (state.data === undefined) return;

    const parsed = sessionUserSchema.safeParse(state.data);
    const userId = parsed.success ? parsed.data.user.id : null;
    if (userId === lastUserId) return;
    lastUserId = userId;

    setUser(userId ? { id: userId } : null);
  });
}
