import type { IInstrumentation } from "@packages/ddd-kit";
import { createErrorHandler as createHttpErrorHandler } from "@packages/http/error-handler";
import type { ErrorHandler } from "hono";
import { env } from "../env";
import { logger } from "../logger";

export function createErrorHandler(instrumentation: IInstrumentation): ErrorHandler {
  return createHttpErrorHandler({
    instrumentation,
    logger,
    isProduction: env.NODE_ENV === "production",
  });
}
