import { type AppError, AppErrorException, type Option, type Result } from "@packages/ddd-kit";
import { createMiddleware } from "hono/factory";
import { assertNotImpersonated } from "./deny-impersonated.middleware";

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
    assertNotImpersonated(session);

    if (user.twoFactorEnabled !== true) {
      throw new AppErrorException({
        code: "ADMIN_STEP_UP_MFA_FORBIDDEN",
        message: "Turn on two-factor authentication to confirm this action.",
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
