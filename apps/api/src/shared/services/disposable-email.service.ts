import { resolveMx } from "node:dns/promises";
import { Result } from "@packages/ddd-kit";

// disposable-email-domains exports an array of domain strings (CJS default, no @types)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const disposableDomains: string[] = require("disposable-email-domains") as string[];

import { env } from "../env";
import type { DisposableEmailError, IDisposableEmailService } from "../ports/disposable-email.port";
import type { IInstrumentation } from "../ports/instrumentation.port";

// Build Set once at module load for O(1) lookups — ~90 k entries, <10 MB
const DISPOSABLE_SET = new Set<string>(disposableDomains);

// DNS error codes that mean "no MX record" — treat the domain as suspicious (disposable)
const NO_MX_CODES = new Set(["ENOTFOUND", "ENODATA", "ENONAME"]);

export class DisposableEmailService implements IDisposableEmailService {
  constructor(private readonly instrumentation: IInstrumentation) {}

  async isDisposable(email: string): Promise<Result<boolean, DisposableEmailError>> {
    return this.instrumentation.startSpan({ name: "DisposableEmailService > isDisposable" }, () =>
      this.check(email),
    );
  }

  private async check(email: string): Promise<Result<boolean, DisposableEmailError>> {
    const domain = email.split("@")[1]?.toLowerCase();
    if (!domain) return Result.ok(false);

    // (a) Static list — O(1), no DNS needed
    if (DISPOSABLE_SET.has(domain)) return Result.ok(true);

    // (b) MX check with timeout (resolveMx does not accept AbortSignal)
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () =>
          reject(
            new Error(`DNS timeout after ${env.DISPOSABLE_EMAIL_DNS_TIMEOUT_MS}ms for ${domain}`),
          ),
        env.DISPOSABLE_EMAIL_DNS_TIMEOUT_MS,
      );
    });

    try {
      const mxRecords = await this.instrumentation.startSpan(
        { name: "dns.resolveMx", op: "net.dns", attributes: { "net.peer.name": domain } },
        () => Promise.race([resolveMx(domain), timeoutPromise]),
      );
      clearTimeout(timer);
      // No MX records → domain has no mail infrastructure → treat as disposable
      return Result.ok(mxRecords.length === 0);
    } catch (err) {
      clearTimeout(timer);
      const code = (err as { code?: string }).code ?? "";
      // Known "domain doesn't exist / no MX" errors → treat as disposable (fail-safe)
      if (NO_MX_CODES.has(code)) return Result.ok(true);
      // Transient failure (timeout, network error) → capture + fail-open at call site
      this.instrumentation.capture(err);
      return Result.fail({
        code: "DISPOSABLE_CHECK_FAILURE",
        message: err instanceof Error ? err.message : "DNS error",
      });
    }
  }
}
