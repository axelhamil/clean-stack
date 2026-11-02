import { AppErrorException, httpStatusFromCode } from "@packages/ddd-kit";
import type { ErrorHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { env } from "../env";
import { logger } from "../logger";
import type { IInstrumentation } from "../ports/instrumentation.port";

const isProd = env.NODE_ENV === "production";

export const SERVER_ERROR_MESSAGE =
  "The service could not complete this request. Retry in a moment, and quote the requestId if it persists.";

type ErrorBody = {
  error: {
    code: string;
    message: string;
    requestId?: string;
    stack?: string;
    metadata?: Record<string, unknown>;
  };
};

export function createErrorHandler(instrumentation: IInstrumentation): ErrorHandler {
  return (err, c) => {
    const requestId = c.get("requestId");
    const userId = c.get("user")?.id;
    const orgId = c.get("session")?.activeOrganizationId ?? undefined;
    const trackerContext = { requestId, userId, orgId, path: c.req.path, method: c.req.method };

    const reportServerError = (message: string) => {
      logger.error({ err, requestId, path: c.req.path }, message);
      instrumentation.capture(err, trackerContext);
    };

    if (err instanceof AppErrorException) {
      const status = httpStatusFromCode(err.code) as ContentfulStatusCode;

      if (status >= 500) {
        reportServerError(err.message);

        return c.json(
          {
            error: { code: err.code, message: SERVER_ERROR_MESSAGE, requestId },
          } satisfies ErrorBody,
          status,
        );
      }

      const body: ErrorBody = {
        error: {
          code: err.code,
          message: err.message,
          requestId,
          ...(err.metadata ? { metadata: err.metadata } : {}),
        },
      };

      return c.json(body, status);
    }

    if (err instanceof HTTPException) {
      const status = err.status;
      const body: ErrorBody = {
        error: {
          code: `HTTP_${status}`,
          message: status >= 500 ? SERVER_ERROR_MESSAGE : err.message,
          requestId,
        },
      };
      if (status >= 500) reportServerError(err.message);

      return c.json(body, status);
    }

    logger.error({ err, requestId, path: c.req.path, method: c.req.method }, "Unhandled error");
    instrumentation.capture(err, trackerContext);

    const body: ErrorBody = {
      error: {
        code: "INTERNAL_ERROR",
        message: SERVER_ERROR_MESSAGE,
        requestId,
        ...(isProd ? {} : { stack: err.stack }),
      },
    };
    return c.json(body, 500);
  };
}
