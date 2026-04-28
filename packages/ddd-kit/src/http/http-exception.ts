import { HttpCode } from "./http-code";

export class HttpException extends Error {
  constructor(
    public readonly message: string,
    public readonly options: ErrorOptions,
    public readonly httpCode: HttpCode = HttpCode.INTERNAL_SERVER_ERROR,
  ) {
    super(message, options);
  }
}

export class BadRequestException extends HttpException {
  constructor(
    public readonly message: string,
    public readonly options: ErrorOptions,
    public readonly httpCode: HttpCode = HttpCode.BAD_REQUEST,
  ) {
    super(message, options);
  }
}

export class UnauthorizedException extends HttpException {
  constructor(
    public readonly message: string,
    public readonly options: ErrorOptions,
    public readonly httpCode: HttpCode = HttpCode.UNAUTHORIZED,
  ) {
    super(message, options);
  }
}

export class NotFoundException extends HttpException {
  constructor(
    public readonly message: string,
    public readonly options: ErrorOptions = {},
    public readonly httpCode: HttpCode = HttpCode.NOT_FOUND,
  ) {
    super(message, options);
  }
}

export class ForbiddenException extends HttpException {
  constructor(
    public readonly message: string,
    public readonly options: ErrorOptions,
    public readonly httpCode: HttpCode = HttpCode.FORBIDDEN,
  ) {
    super(message, options);
  }
}

export class ConflictException extends HttpException {
  constructor(
    public readonly message: string,
    public readonly options: ErrorOptions,
    public readonly httpCode: HttpCode = HttpCode.CONFLICT,
  ) {
    super(message, options);
  }
}

export class UnprocessableEntityException extends HttpException {
  constructor(
    public readonly message: string,
    public readonly options: ErrorOptions,
    public readonly httpCode: HttpCode = HttpCode.UNPROCESSABLE_ENTITY,
  ) {
    super(message, options);
  }
}

export class TooManyRequestsException extends HttpException {
  constructor(
    public readonly message: string,
    public readonly options: ErrorOptions,
    public readonly httpCode: HttpCode = HttpCode.TOO_MANY_REQUESTS,
  ) {
    super(message, options);
  }
}

export class InternalServerErrorException extends HttpException {
  constructor(
    public readonly message: string,
    public readonly options: ErrorOptions,
    public readonly httpCode: HttpCode = HttpCode.INTERNAL_SERVER_ERROR,
  ) {
    super(message, options);
  }
}

export class ServiceUnavailableException extends HttpException {
  constructor(
    public readonly message: string,
    public readonly options: ErrorOptions,
    public readonly httpCode: HttpCode = HttpCode.SERVICE_UNAVAILABLE,
  ) {
    super(message, options);
  }
}
