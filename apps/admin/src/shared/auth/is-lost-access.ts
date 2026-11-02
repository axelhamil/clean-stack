import { STAFF_REFUSAL } from "@packages/access-control";
import { apiErrorFields } from "@packages/web-kit/api/errors/api-error";

const LOST_ACCESS_CODES = new Set<string>(Object.values(STAFF_REFUSAL));

export function isLostAccess(error: unknown): boolean {
  return LOST_ACCESS_CODES.has(apiErrorFields(error).code ?? "");
}
