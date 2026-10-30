import { Result } from "@packages/ddd-kit";
import { z } from "zod";
import { instrumentedFetch } from "../instrumented-fetch";
import type { CaptchaError, ICaptchaService } from "../ports/captcha.port";
import type { IInstrumentation } from "../ports/instrumentation.port";

const MAX_TOKEN_LENGTH = 2048;

const OUR_FAULT_CODES = new Set([
  "missing-input-secret",
  "invalid-input-secret",
  "invalid-sitekey-secret",
  "sitekey-secret-mismatch",
  "internal-error",
]);

const SiteverifyAnswer = z.object({
  success: z.boolean(),
  "error-codes": z.array(z.string()).optional(),
});

export interface SiteverifyConfig {
  secretKey: string;
  verifyUrl: string;
  timeoutMs: number;
}

export class SiteverifyCaptchaService implements ICaptchaService {
  readonly enabled = true;

  constructor(
    private readonly instrumentation: IInstrumentation,
    private readonly config: SiteverifyConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async verify(token: string, remoteIp: string): Promise<Result<boolean, CaptchaError>> {
    return this.instrumentation.startSpan({ name: "SiteverifyCaptchaService > verify" }, () =>
      this.callProvider(token, remoteIp),
    );
  }

  private async callProvider(
    token: string,
    remoteIp: string,
  ): Promise<Result<boolean, CaptchaError>> {
    if (token.length > MAX_TOKEN_LENGTH) return Result.ok(false);

    try {
      const response = await instrumentedFetch(
        this.instrumentation,
        this.fetchImpl,
        this.config.verifyUrl,
        {
          method: "POST",
          body: new URLSearchParams({
            secret: this.config.secretKey,
            response: token,
            remoteip: remoteIp,
          }),
          signal: AbortSignal.timeout(this.config.timeoutMs),
        },
      );

      if (response.status >= 500) throw new Error(`captcha provider answered ${response.status}`);

      const answer = SiteverifyAnswer.parse(await response.json());
      const ourFault = answer["error-codes"]?.find((code) => OUR_FAULT_CODES.has(code));
      if (ourFault) throw new Error(`captcha provider refused the request: ${ourFault}`);

      return Result.ok(answer.success);
    } catch (err) {
      this.instrumentation.capture(err);

      return Result.fail({
        code: "CAPTCHA_PROVIDER_FAILURE",
        message: "captcha verification is unavailable",
      });
    }
  }
}
