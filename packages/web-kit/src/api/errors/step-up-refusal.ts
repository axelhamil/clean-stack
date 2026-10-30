import type { QueryClient } from "@tanstack/react-query";
import { apiErrorFields } from "./api-error";

const ADMIN_REAUTH_REQUIRED = "ADMIN_REAUTH_REQUIRED";

export function isStepUpRefusal(error: unknown): boolean {
  return apiErrorFields(error).code === ADMIN_REAUTH_REQUIRED;
}

export function watchStepUpRefusals(queryClient: QueryClient, onRefusal: () => void): () => void {
  return queryClient.getMutationCache().subscribe((event) => {
    if (event.type !== "updated" || event.action.type !== "error") return;
    if (isStepUpRefusal(event.action.error)) onRefusal();
  });
}
