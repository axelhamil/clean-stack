import type { IInstrumentation } from "@packages/ddd-kit";
import { auth } from "../auth";
import type { IAuthProvider } from "../modules/admin/application/ports/auth-provider.port";
import { IMPERSONATION_TTL_SECONDS } from "../shared/auth/impersonation-ttl";
import { deliverPasswordReset } from "../shared/auth/password-reset-delivery";

export class BetterAuthProvider implements IAuthProvider {
  readonly impersonationTtlSeconds = IMPERSONATION_TTL_SECONDS;

  constructor(private readonly instrumentation: IInstrumentation) {}

  impersonateUser(userId: string, headers: Headers): Promise<Response> {
    return this.traced("impersonateUser", () =>
      auth.api.impersonateUser({ body: { userId }, headers, asResponse: true }),
    );
  }

  stopImpersonating(headers: Headers): Promise<Response> {
    return this.traced("stopImpersonating", () =>
      auth.api.stopImpersonating({ headers, asResponse: true }),
    );
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
