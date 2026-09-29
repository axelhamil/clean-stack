import type { IUnitOfWork, Option, Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import { type Locale, toLocale } from "@packages/i18n";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { hmacToken, parseToken } from "../../shared/crypto/api-token";
import { emitEvent } from "../../shared/event-emitter";
import type { IApiTokenRepository } from "../../shared/ports/api-token.port";
import type { IInstrumentation } from "../../shared/ports/instrumentation.port";
import type { IOutboxRepository } from "../../shared/ports/outbox.port";
import type { ITransaction } from "../../shared/transaction";

export interface ScanningDeps {
  githubKeyVerifier: { verify(keyId: string, sig: string, body: string): Promise<boolean> };
  apiTokenRepository: Pick<IApiTokenRepository, "findByHmac" | "revoke">;
  transactionService: Pick<IUnitOfWork<ITransaction>, "run">;
  outboxRepository: IOutboxRepository;
  emailService: {
    sendTemplate(
      template: string,
      email: string,
      data: Record<string, unknown>,
      options?: { locale?: Locale },
    ): Promise<Result<void, unknown>>;
  };
  instrumentation: IInstrumentation;
  findUserById: (
    id: string,
  ) => Promise<Option<{ email: string; name?: string | null; locale?: string | null }>>;
  prefix: string;
  pepper: string;
  pepperPrevious?: string;
}

const scanPayloadSchema = z.array(
  z.object({ token: z.string(), type: z.string(), url: z.string().optional() }),
);

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

    let json: unknown;
    try {
      json = JSON.parse(rawBody);
    } catch {
      throw new HTTPException(400, { message: "INVALID_BODY" });
    }

    const payload = scanPayloadSchema.safeParse(json);
    if (!payload.success) throw new HTTPException(400, { message: "INVALID_BODY" });
    const entries = payload.data;

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

        let opt = findResult.getValue();

        if (opt.isNone() && deps.pepperPrevious) {
          const prevHmac = hmacToken(entry.token, deps.pepperPrevious);
          const prevFindResult = await deps.apiTokenRepository.findByHmac(prevHmac);
          if (prevFindResult.isFailure) {
            throw new HTTPException(500, { message: "DB_ERROR" });
          }
          opt = prevFindResult.getValue();
        }

        if (opt.isNone()) {
          return {
            token_raw: entry.token,
            token_type: entry.type,
            label: "false_positive",
          } as const;
        }

        const record = opt.unwrap();

        if (record.revokedAt.isNone()) {
          const revoked = await deps.transactionService
            .run(async (tx) => {
              const revokeResult = await deps.apiTokenRepository.revoke(record.id, "leaked", tx);
              if (revokeResult.isFailure) return revokeResult;

              await emitEvent(
                deps.outboxRepository,
                EventTypes.API_TOKEN_REVOKED,
                "api_token",
                record.id,
                {
                  userId: record.userId,
                  actorUserId: null,
                  organizationId: record.organizationId.toNull(),
                  tokenId: record.id,
                  reason: "leaked" as const,
                },
                { organizationId: record.organizationId.toNull() },
                tx,
              );

              return revokeResult;
            })
            .catch((err: unknown) => {
              deps.instrumentation.capture(err);
              throw new HTTPException(500, { message: "REVOKE_FAILED" });
            });
          if (revoked.isFailure) throw new HTTPException(500, { message: "REVOKE_FAILED" });

          const found = await deps.findUserById(record.userId);
          if (found.isSome()) {
            const user = found.unwrap();
            const locale = toLocale(user.locale);
            const sent = await deps.emailService.sendTemplate(
              "api_token_leaked",
              user.email,
              {
                name: user.name ?? "User",
                tokenName: record.name,
                revokedAt: new Date().toLocaleString(locale),
              },
              { locale },
            );
            if (sent.isFailure) deps.instrumentation.capture(sent.getError());
          }
        }

        return { token_raw: entry.token, token_type: entry.type, label: "true_positive" } as const;
      }),
    );

    return c.json(results);
  });
}
