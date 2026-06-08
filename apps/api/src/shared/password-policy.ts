import type { IPasswordBreachService } from "./ports/password-breach.port";

export const MIN_PASSWORD_LENGTH = 15;

export function findPasswordViolation(
  password: string,
  ctx: { email?: string; name?: string; appName: string },
): string | null {
  const lower = password.toLowerCase();

  const emailLocal = ctx.email?.split("@")[0];
  if (emailLocal && emailLocal.length >= 3 && lower.includes(emailLocal.toLowerCase())) {
    return "Password must not contain your email address.";
  }

  if (ctx.name && ctx.name.length >= 3 && lower.includes(ctx.name.toLowerCase())) {
    return "Password must not contain your name.";
  }

  const appToken = ctx.appName.toLowerCase().replace(/-/g, "");
  if (appToken.length >= 3 && lower.includes(appToken)) {
    return "Password must not contain the application name.";
  }

  return null;
}

export async function validatePassword(
  password: string,
  ctx: { email?: string; name?: string; appName: string },
  breachService: IPasswordBreachService,
): Promise<string | null> {
  if (password.length < MIN_PASSWORD_LENGTH) return null;

  const violation = findPasswordViolation(password, ctx);
  if (violation) return violation;

  const breach = await breachService.isBreached(password);
  if (breach.isSuccess && breach.getValue()) {
    return "This password has appeared in a known data breach. Choose a different one.";
  }

  return null;
}
