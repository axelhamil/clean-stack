import { AppErrorException, httpStatusFromCode } from "@packages/ddd-kit";
import type { ErrorHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { env } from "../../../common/env";
import { logger } from "../../../common/logger";

const isProd = env.NODE_ENV === "production";

type ErrorBody = {
  error: {
    code: string;
    message: string;
    requestId?: string;
    stack?: string;
  };
};

export const errorHandler: ErrorHandler = (err, c) => {
  const requestId = c.get("requestId");

  if (err instanceof AppErrorException) {
    const status = httpStatusFromCode(err.code) as ContentfulStatusCode;
    const body: ErrorBody = {
      error: { code: err.code, message: err.message, requestId },
    };
    if (status >= 500) {
      logger.error({ err, requestId, path: c.req.path }, err.message);
    }
    return c.json(body, status);
  }

  if (err instanceof HTTPException) {
    const status = err.status;
    const body: ErrorBody = {
      error: {
        code: `HTTP_${status}`,
        message: err.message,
        requestId,
      },
    };
    if (status >= 500) {
      logger.error({ err, requestId, path: c.req.path }, err.message);
    }
    return c.json(body, status);
  }

  logger.error({ err, requestId, path: c.req.path, method: c.req.method }, "Unhandled error");

  const body: ErrorBody = {
    error: {
      code: "INTERNAL_ERROR",
      message: "Internal Server Error",
      requestId,
      ...(isProd ? {} : { stack: err.stack }),
    },
  };
  return c.json(body, 500);
};
