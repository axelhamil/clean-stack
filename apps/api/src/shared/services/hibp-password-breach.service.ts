import { Result } from "@packages/ddd-kit";
import { CryptoHasher } from "bun";
import { env } from "../env";
import { instrumentedFetch } from "../instrumented-fetch";
import type { IInstrumentation } from "../ports/instrumentation.port";
import type { IPasswordBreachService, PasswordBreachError } from "../ports/password-breach.port";

export class HibpPasswordBreachService implements IPasswordBreachService {
  constructor(
    private readonly instrumentation: IInstrumentation,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async isBreached(password: string): Promise<Result<boolean, PasswordBreachError>> {
    return this.instrumentation.startSpan({ name: "HibpPasswordBreachService > isBreached" }, () =>
      this.checkBreached(password),
    );
  }

  private async checkBreached(password: string): Promise<Result<boolean, PasswordBreachError>> {
    const hash = new CryptoHasher("sha1").update(password).digest("hex").toUpperCase();
    const prefix = hash.slice(0, 5);
    const suffix = hash.slice(5);

    try {
      const response = await instrumentedFetch(
        this.instrumentation,
        this.fetchImpl,
        `https://api.pwnedpasswords.com/range/${prefix}`,
        {
          method: "GET",
          headers: { "Add-Padding": "true" },
          signal: AbortSignal.timeout(env.HIBP_TIMEOUT_MS),
        },
      );

      if (!response.ok) {
        this.instrumentation.capture(new Error(`HIBP responded with HTTP ${response.status}`));
        return Result.fail({
          code: "BREACH_CHECK_PROVIDER_FAILURE",
          message: `HTTP ${response.status}`,
        });
      }

      const text = await response.text();
      const found = text.split(/\r?\n/).some((line) => line.startsWith(`${suffix}:`));
      return Result.ok(found);
    } catch (err) {
      this.instrumentation.capture(err);
      return Result.fail({
        code: "BREACH_CHECK_PROVIDER_FAILURE",
        message: err instanceof Error ? err.message : "network error",
      });
    }
  }
}
