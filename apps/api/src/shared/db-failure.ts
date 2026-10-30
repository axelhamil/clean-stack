import { type AppError, type ErrorCode, Result } from "@packages/ddd-kit";
import { logger } from "./logger";

/**
 * Factory that returns a typed catch-handler for repository methods.
 *
 * Pre-binds `code` so the returned function can be called inline in a `.catch()`
 * or `catch(e)` block: it logs the raw error, then wraps it in a `Result.fail`
 * with a consistent `{ code, message }` shape, no boilerplate per method.
 */
export function createDbFailure<TCode extends ErrorCode>(code: TCode) {
  return (
    e: unknown,
    msg: string,
    ctx?: Record<string, unknown>,
  ): Result<never, AppError<TCode>> => {
    logger.error({ err: e, ...ctx }, msg);
    return Result.fail({ code, message: msg });
  };
}

/**
 * Factory for the error a store returns when a query throws: the operation in the
 * message, never the driver's text. The store has already captured the error, which
 * is where that text goes.
 */
export function dbOperationFailure<TCode extends ErrorCode>(code: TCode) {
  return (op: string): AppError<TCode> => ({
    code,
    message: `database operation failed: ${op}`,
  });
}
