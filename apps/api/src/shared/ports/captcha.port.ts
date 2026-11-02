import type { AppError, Result } from "@packages/ddd-kit";

export type CaptchaError = AppError<"CAPTCHA_PROVIDER_FAILURE">;

export interface ICaptchaService {
  readonly enabled: boolean;
  verify(token: string, remoteIp: string): Promise<Result<boolean, CaptchaError>>;
}
