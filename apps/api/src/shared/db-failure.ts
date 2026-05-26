import { type AppError, type ErrorCode, Result } from "@packages/ddd-kit";
import { logger } from "./logger";

export function createDbFailure<TCode extends ErrorCode>(code: TCode) {
  return (
    e: unknown,
    msg: string,
    ctx?: Record<string, unknown>,
  ): Result<never, AppError<TCode>> => {
    const message = e instanceof Error ? e.message : "unknown error";
    logger.error({ err: e, ...ctx }, msg);
    return Result.fail({ code, message });
  };
}
