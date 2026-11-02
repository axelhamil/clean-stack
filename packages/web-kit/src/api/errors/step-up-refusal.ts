import type { QueryClient } from "@tanstack/react-query";
import { apiErrorFields } from "./api-error";
import { watchRefusals } from "./watch-refusals";

const ADMIN_REAUTH_REQUIRED = "ADMIN_REAUTH_REQUIRED";

export function isStepUpRefusal(error: unknown): boolean {
  return apiErrorFields(error).code === ADMIN_REAUTH_REQUIRED;
}

export function watchStepUpRefusals(queryClient: QueryClient, onRefusal: () => void): () => void {
  return watchRefusals(queryClient, (error) => {
    if (isStepUpRefusal(error)) onRefusal();
  });
}
