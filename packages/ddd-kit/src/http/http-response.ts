import { HttpCode } from "./http-code";

export interface HttpResponse<T = unknown> {
  statusCode: HttpCode;
  message: "success" | "error";
  timestamp: Date;
  data: T | null;
  error?: {
    name?: string;
    code?: string;
    details?:
      | string
      | Array<{
          field?: string;
          message?: string;
          rule?: string;
        }>
      | unknown;
    stack?: string;
  };
}

export interface SuccessResponse<T = unknown> extends HttpResponse<T> {
  message: "success";
  data: T;
}

export interface ErrorResponse extends HttpResponse<null> {
  message: "error";
  data: null;
  error: {
    name: string;
    code: string;
    details?:
      | string
      | Array<{
          field?: string;
          message?: string;
          rule?: string;
        }>
      | unknown;
    stack?: string;
  };
}

export function createSuccessResponse<T>(
  data: T,
  statusCode: HttpCode = HttpCode.OK,
): SuccessResponse<T> {
  return {
    statusCode,
    message: "success",
    timestamp: new Date(),
    data,
  };
}

export function createErrorResponse(
  statusCode: HttpCode,
  errorMessage: string,
  options?: {
    name?: string;
    code?: string;
    details?:
      | string
      | Array<{
          field?: string;
          message?: string;
          rule?: string;
        }>
      | unknown;
    stack?: string;
  },
): ErrorResponse {
  return {
    statusCode,
    message: "error",
    timestamp: new Date(),
    data: null,
    error: {
      name: options?.name || "ApplicationError",
      code: options?.code || `ERR_${statusCode}`,
      details: options?.details || errorMessage,
      stack: options?.stack,
    },
  };
}

export function createValidationErrorResponse(
  validationErrors: Array<{
    field?: string;
    message?: string;
    rule?: string;
  }>,
): ErrorResponse {
  return createErrorResponse(HttpCode.BAD_REQUEST, "Validation error", {
    name: "ValidationError",
    code: "ERR_VALIDATION",
    details: validationErrors,
  });
}

export function createInternalErrorResponse(
  error?: Error,
  exposeDetails = false,
): ErrorResponse {
  return createErrorResponse(
    HttpCode.INTERNAL_SERVER_ERROR,
    "Internal Server Error",
    {
      name: error?.name || "InternalServerError",
      code: "ERR_INTERNAL",
      details: exposeDetails ? error?.message : "An internal error occurred",
      stack: exposeDetails ? error?.stack : undefined,
    },
  );
}
