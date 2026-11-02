import { apiErrorFields } from "@packages/web-kit/api/errors/api-error";
import { watchRefusals } from "@packages/web-kit/api/errors/watch-refusals";
import type { QueryClient } from "@tanstack/react-query";
import { isLostAccess } from "./is-lost-access";

export function watchAccessRefusals(queryClient: QueryClient, recheck: () => void): () => void {
  return watchRefusals(queryClient, (error) => {
    if (apiErrorFields(error).status === 401 || isLostAccess(error)) recheck();
  });
}
