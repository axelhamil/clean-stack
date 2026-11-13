import { type IInstrumentation, type ILogger, Result } from "@packages/ddd-kit";
import { and, dbOperationFailure, eq, resolveExecutor, schema } from "@packages/drizzle";
import { verifyPassword as verifyHash } from "better-auth/crypto";
import type {
  IPasswordVerifier,
  PasswordVerifierError,
} from "../../application/ports/services/password-verifier.port";

const dbAttrs = { "db.system.name": "postgresql" } as const;

const verifierFailure = dbOperationFailure("RGPD_REPOSITORY_PROVIDER_FAILURE");

export class CredentialPasswordVerifier implements IPasswordVerifier {
  constructor(
    private readonly logger: ILogger,
    private readonly instrumentation: IInstrumentation,
  ) {}

  async matches(userId: string, password: string): Promise<Result<boolean, PasswordVerifierError>> {
    const exec = resolveExecutor();
    return this.instrumentation.startSpan(
      { name: "CredentialPasswordVerifier > matches" },
      async () => {
        try {
          const query = exec
            .select({ password: schema.account.password })
            .from(schema.account)
            .where(
              and(eq(schema.account.userId, userId), eq(schema.account.providerId, "credential")),
            )
            .limit(1);
          const [credential] = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );
          if (!credential?.password) return Result.ok(false);

          return Result.ok(await verifyHash({ hash: credential.password, password }));
        } catch (err) {
          this.instrumentation.capture(err);
          this.logger.error({ err, userId }, "CredentialPasswordVerifier.matches failed");
          return Result.fail(verifierFailure("verifyPassword"));
        }
      },
    );
  }
}
