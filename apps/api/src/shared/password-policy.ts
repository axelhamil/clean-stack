import type { IPasswordBreachService } from "./ports/password-breach.port";

export const MIN_PASSWORD_LENGTH = 15;

export interface PasswordViolation {
  message: string;
  isBreach: boolean;
}

export function findPasswordViolation(
  password: string,
  ctx: { email?: string; name?: string; appName: string },
): PasswordViolation | null {
  const lower = password.toLowerCase();

  const emailLocal = ctx.email?.split("@")[0];
  if (emailLocal && emailLocal.length >= 3 && lower.includes(emailLocal.toLowerCase())) {
    return { message: "Password must not contain your email address.", isBreach: false };
  }

  if (ctx.name && ctx.name.length >= 3 && lower.includes(ctx.name.toLowerCase())) {
    return { message: "Password must not contain your name.", isBreach: false };
  }

  const appToken = ctx.appName.toLowerCase().replace(/-/g, "");
  if (appToken.length >= 3 && lower.includes(appToken)) {
    return { message: "Password must not contain the application name.", isBreach: false };
  }

  return null;
}

export async function validatePassword(
  password: string,
  ctx: { email?: string; name?: string; appName: string },
  breachService: IPasswordBreachService,
): Promise<PasswordViolation | null> {
  if (password.length < MIN_PASSWORD_LENGTH) return null;

  const violation = findPasswordViolation(password, ctx);
  if (violation) return violation;

  const breach = await breachService.isBreached(password);
  if (breach.isSuccess && breach.getValue()) {
    return {
      message: "This password has appeared in a known data breach. Choose a different one.",
      isBreach: true,
    };
  }

  return null;
}
