import type {
  AuthRequestCredentials,
  IAuthProvider,
  ImpersonationRefusedError,
  SessionCookies,
  StopImpersonationRefusedError,
} from "@modules/admin/ports/auth-provider";
import { type AppError, type ErrorCode, type IInstrumentation, Result } from "@packages/ddd-kit";
import { auth } from "../auth";
import { IMPERSONATION_TTL_SECONDS } from "../auth/impersonation-ttl";
import { deliverPasswordReset } from "../auth/password-reset-delivery";

function headersOf(credentials: AuthRequestCredentials): Headers {
  const headers = new Headers();
  for (const [name, value] of credentials) headers.append(name, value);

  return headers;
}

function sessionCookiesOf<Code extends ErrorCode>(
  upstream: Response,
  code: Code,
): Result<SessionCookies, AppError<Code>> {
  if (upstream.ok) return Result.ok(upstream.headers.getSetCookie());

  return Result.fail({ code, message: "The impersonation request was refused." });
}

export class BetterAuthProvider implements IAuthProvider {
  readonly impersonationTtlSeconds = IMPERSONATION_TTL_SECONDS;

  constructor(private readonly instrumentation: IInstrumentation) {}

  async impersonateUser(
    userId: string,
    credentials: AuthRequestCredentials,
  ): Promise<Result<SessionCookies, ImpersonationRefusedError>> {
    const upstream = await this.traced("impersonateUser", () =>
      auth.api.impersonateUser({
        body: { userId },
        headers: headersOf(credentials),
        asResponse: true,
      }),
    );

    return sessionCookiesOf(upstream, "ADMIN_IMPERSONATION_FORBIDDEN");
  }

  async stopImpersonating(
    credentials: AuthRequestCredentials,
  ): Promise<Result<SessionCookies, StopImpersonationRefusedError>> {
    const upstream = await this.traced("stopImpersonating", () =>
      auth.api.stopImpersonating({ headers: headersOf(credentials), asResponse: true }),
    );

    return sessionCookiesOf(upstream, "ADMIN_STOP_IMPERSONATION_FORBIDDEN");
  }

  requestPasswordReset(email: string): ReturnType<IAuthProvider["requestPasswordReset"]> {
    return this.instrumentation.startSpan(
      { name: "BetterAuthProvider > requestPasswordReset" },
      () =>
        deliverPasswordReset(
          () => auth.api.requestPasswordReset({ body: { email } }),
          (error) => this.instrumentation.capture(error),
        ),
    );
  }

  handle(request: Request): Promise<Response> {
    return this.traced("handle", () => auth.handler(request));
  }

  private traced(method: string, call: () => Promise<Response>): Promise<Response> {
    return this.instrumentation.startSpan({ name: `BetterAuthProvider > ${method}` }, async () => {
      try {
        return await call();
      } catch (error) {
        this.instrumentation.capture(error);
        throw error;
      }
    });
  }
}
