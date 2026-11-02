import { Result } from "@packages/ddd-kit";
import type { CaptchaError, ICaptchaService } from "../ports/captcha.port";

export class NoopCaptchaService implements ICaptchaService {
  readonly enabled = false;

  async verify(): Promise<Result<boolean, CaptchaError>> {
    return Result.ok(true);
  }
}
