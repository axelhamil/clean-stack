import type { Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { hmacToken, parseToken } from "../../shared/crypto/api-token";
import { emitEvent } from "../../shared/event-emitter";
import type { IInstrumentation } from "../../shared/ports/instrumentation.port";
import type { IOutboxRepository } from "../../shared/ports/outbox.port";
import type { ITransaction } from "../../shared/transaction";
import type { IApiTokenRepository } from "./application/ports/api-token.port";

export interface ScanningDeps {
  githubKeyVerifier: { verify(keyId: string, sig: string, body: string): Promise<boolean> };
  apiTokenRepository: Pick<IApiTokenRepository, "findByHmac" | "revoke">;
  transactionService: { run(cb: (tx: ITransaction) => Promise<void>): Promise<void> };
  outboxRepository: IOutboxRepository;
  emailService: {
    sendTemplate(
      template: string,
      email: string,
      data: Record<string, unknown>,
    ): Promise<Result<void, unknown>>;
  };
  instrumentation: IInstrumentation;
  findUserById: (id: string) => Promise<{ email: string; name?: string | null } | undefined>;
  prefix: string;
  pepper: string;
}

type ScanEntry = { token: string; type: string; url?: string };

export function createApiTokenScanningRoutes(deps: ScanningDeps): Hono {
  return new Hono().post("/github", async (c) => {
    const rawBody = await c.req.text();

    const keyId = c.req.header("GITHUB-PUBLIC-KEY-IDENTIFIER");
    const sigB64 = c.req.header("GITHUB-PUBLIC-KEY-SIGNATURE");

    if (!keyId || !sigB64) {
      throw new HTTPException(403, { message: "MISSING_SIGNATURE_HEADERS" });
    }

    const valid = await deps.githubKeyVerifier.verify(keyId, sigB64, rawBody);
    if (!valid) throw new HTTPException(403, { message: "INVALID_SIGNATURE" });

    let entries: ScanEntry[];
    try {
      entries = JSON.parse(rawBody) as ScanEntry[];
    } catch {
      throw new HTTPException(400, { message: "INVALID_BODY" });
    }

    const results = await Promise.all(
      entries.map(async (entry) => {
        const parseResult = parseToken(entry.token, deps.prefix);
        if (parseResult.isFailure) {
          return {
            token_raw: entry.token,
            token_type: entry.type,
            label: "false_positive",
          } as const;
        }

        const tokenHmac = hmacToken(entry.token, deps.pepper);
        const findResult = await deps.apiTokenRepository.findByHmac(tokenHmac);
        if (findResult.isFailure) {
          throw new HTTPException(500, { message: "DB_ERROR" });
        }

        const opt = findResult.getValue();
        if (opt.isNone()) {
          return {
            token_raw: entry.token,
            token_type: entry.type,
            label: "false_positive",
          } as const;
        }

        const record = opt.unwrap();

        if (record.revokedAt === null) {
          let revokeFailure: Error | null = null;
          try {
            await deps.transactionService.run(async (tx) => {
              const revokeResult = await deps.apiTokenRepository.revoke(record.id, "leaked", tx);
              if (revokeResult.isFailure) {
                revokeFailure = new Error(revokeResult.getError().message);
                throw revokeFailure;
              }

              await emitEvent(
                deps.outboxRepository,
                EventTypes.API_TOKEN_REVOKED,
                "api_token",
                record.id,
                {
                  userId: record.userId,
                  actorUserId: null,
                  organizationId: record.organizationId,
                  tokenId: record.id,
                  reason: "leaked" as const,
                },
                { organizationId: record.organizationId },
                tx,
              );
            });
          } catch (err) {
            if (!revokeFailure) deps.instrumentation.capture(err);
            throw new HTTPException(500, { message: "REVOKE_FAILED" });
          }

          const user = await deps.findUserById(record.userId);
          if (user) {
            const sent = await deps.emailService.sendTemplate("api_token_leaked", user.email, {
              name: user.name ?? "User",
              tokenName: record.name,
              revokedAt: new Date().toLocaleString("en-US"),
            });
            if (sent.isFailure) deps.instrumentation.capture(sent.getError());
          }
        }

        return { token_raw: entry.token, token_type: entry.type, label: "true_positive" } as const;
      }),
    );

    return c.json(results);
  });
}

// Convenience export for type inference used in `client.ts`.
export type ApiTokenScanningRoutes = ReturnType<typeof createApiTokenScanningRoutes>;
