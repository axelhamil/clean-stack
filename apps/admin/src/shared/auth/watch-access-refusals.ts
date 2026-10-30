import { apiErrorFields } from "@packages/web-kit/api/errors/api-error";
import { watchRefusals } from "@packages/web-kit/api/errors/watch-refusals";
import type { QueryClient } from "@tanstack/react-query";

const LOST_ACCESS_CODES = new Set([
  "ADMIN_STAFF_FORBIDDEN",
  "ADMIN_STAFF_MFA_FORBIDDEN",
  "ADMIN_STAFF_PERMISSION_FORBIDDEN",
]);

export function watchAccessRefusals(queryClient: QueryClient, recheck: () => void): () => void {
  return watchRefusals(queryClient, (error) => {
    const { code, status } = apiErrorFields(error);
    if (status === 401 || LOST_ACCESS_CODES.has(code ?? "")) recheck();
  });
}
