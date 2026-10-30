import { type AppError, AppErrorException, type Option, type Result } from "@packages/ddd-kit";
import { createMiddleware } from "hono/factory";

export interface StepUpGate {
  validUntil(sessionId: string): Promise<Result<Option<Date>, AppError>>;
}

export interface StepUpUser {
  twoFactorEnabled?: boolean | null;
}

export interface StepUpSession {
  id: string;
  impersonatedBy?: string | null;
}

export function stepUpGuards(gate: () => StepUpGate) {
  async function assertStepUp(user: StepUpUser, session: StepUpSession): Promise<void> {
    if (session.impersonatedBy) {
      throw new AppErrorException({
        code: "IMPERSONATION_ACTION_FORBIDDEN",
        message: "action unavailable while impersonating",
      });
    }

    if (user.twoFactorEnabled !== true) {
      throw new AppErrorException({
        code: "ADMIN_STAFF_MFA_FORBIDDEN",
        message: "This action requires two-factor authentication.",
      });
    }

    const valid = await gate().validUntil(session.id);
    if (valid.isFailure) throw new AppErrorException(valid.getError());

    if (valid.getValue().isNone()) {
      throw new AppErrorException({
        code: "ADMIN_REAUTH_REQUIRED",
        message: "Confirm this action with a code from your authenticator.",
      });
    }
  }

  return {
    assertStepUp,
    requireStepUp: createMiddleware<{ Variables: { user: StepUpUser; session: StepUpSession } }>(
      async (c, next) => {
        await assertStepUp(c.get("user"), c.get("session"));
        await next();
      },
    ),
  };
}
