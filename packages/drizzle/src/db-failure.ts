import type { AppError, ErrorCode } from "@packages/ddd-kit";

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
