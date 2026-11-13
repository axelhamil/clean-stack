export interface StepUpEnv {
  ADMIN_STEP_UP_TTL_SECONDS: number;
}

export function stepUpExpiryOf(verifiedAt: Date, env: StepUpEnv): Date {
  return new Date(verifiedAt.getTime() + env.ADMIN_STEP_UP_TTL_SECONDS * 1000);
}
