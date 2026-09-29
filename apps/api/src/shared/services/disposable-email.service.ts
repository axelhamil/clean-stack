import { resolveMx } from "node:dns/promises";
import { Result } from "@packages/ddd-kit";
import { env } from "../env";
import type { DisposableEmailError, IDisposableEmailService } from "../ports/disposable-email.port";
import type { IInstrumentation } from "../ports/instrumentation.port";

// disposable-email-domains is a CJS array of domains with no type declarations.
const disposableDomains: string[] = require("disposable-email-domains") as string[];

// Built once at module load: about 90 k entries, under 10 MB.
const DISPOSABLE_SET = new Set<string>(disposableDomains);

// DNS error codes that mean "no MX record": the domain is treated as disposable.
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

    if (DISPOSABLE_SET.has(domain)) return Result.ok(true);

    // resolveMx accepts no AbortSignal, so the timeout races it instead.
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

      // A domain with no mail infrastructure cannot own a real inbox.
      return Result.ok(mxRecords.length === 0);
    } catch (err) {
      clearTimeout(timer);

      const code = (err as { code?: string }).code ?? "";
      if (NO_MX_CODES.has(code)) return Result.ok(true);

      // A transient failure (timeout, network) is reported; the call site fails open.
      this.instrumentation.capture(err);
      return Result.fail({
        code: "DISPOSABLE_CHECK_FAILURE",
        message: err instanceof Error ? err.message : "DNS error",
      });
    }
  }
}
