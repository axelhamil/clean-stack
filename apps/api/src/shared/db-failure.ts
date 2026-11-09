import { createDbFailure as createLoggedDbFailure, type ErrorCode } from "@packages/ddd-kit";
import { logger } from "./logger";

export function createDbFailure<TCode extends ErrorCode>(code: TCode) {
  return createLoggedDbFailure(code, logger);
}
