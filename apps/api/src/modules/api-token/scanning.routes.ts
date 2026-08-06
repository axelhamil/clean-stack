import { EventTypes } from "@packages/events";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { findUserById } from "../../auth-queries";
import { di } from "../../container";
import { hmacToken, parseToken } from "../../shared/crypto/api-token";
import { env } from "../../shared/env";
import { emitEvent } from "../../shared/event-emitter";

const PEPPER = env.API_TOKEN_PEPPER ?? "dev-only-pepper-not-for-production-use";

type ScanEntry = { token: string; type: string; url?: string };

export const apiTokenScanningRoutes = new Hono().post("/github", async (c) => {
  const rawBody = await c.req.text();

  const keyId = c.req.header("GITHUB-PUBLIC-KEY-IDENTIFIER");
  const sigB64 = c.req.header("GITHUB-PUBLIC-KEY-SIGNATURE");

  if (!keyId || !sigB64) {
    throw new HTTPException(403, { message: "MISSING_SIGNATURE_HEADERS" });
  }

  const valid = await di.GithubKeyVerifier.verify(keyId, sigB64, rawBody);
  if (!valid) throw new HTTPException(403, { message: "INVALID_SIGNATURE" });

  let entries: ScanEntry[];
  try {
    entries = JSON.parse(rawBody) as ScanEntry[];
  } catch {
    throw new HTTPException(400, { message: "INVALID_BODY" });
  }

  const results = await Promise.all(
    entries.map(async (entry) => {
      const parseResult = parseToken(entry.token, env.API_TOKEN_PREFIX);
      if (parseResult.isFailure) {
        return { token_raw: entry.token, token_type: entry.type, label: "false_positive" } as const;
      }

      const tokenHmac = hmacToken(entry.token, PEPPER);
      const findResult = await di.IApiTokenRepository.findByHmac(tokenHmac);
      if (findResult.isFailure) {
        throw new HTTPException(500, { message: "DB_ERROR" });
      }

      const opt = findResult.getValue();
      if (opt.isNone()) {
        return { token_raw: entry.token, token_type: entry.type, label: "false_positive" } as const;
      }

      const record = opt.unwrap();

      if (record.revokedAt === null) {
        let revokeFailure: Error | null = null;
        try {
          await di.ITransactionService.run(async (tx) => {
            const revokeResult = await di.IApiTokenRepository.revoke(record.id, "leaked", tx);
            if (revokeResult.isFailure) {
              revokeFailure = new Error(revokeResult.getError().message);
              throw revokeFailure;
            }

            await emitEvent(
              di.IOutboxRepository,
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
          if (!revokeFailure) di.IInstrumentation.capture(err);
          throw new HTTPException(500, { message: "REVOKE_FAILED" });
        }

        const user = await findUserById(record.userId);
        if (user) {
          const sent = await di.IEmailService.sendTemplate("api_token_leaked", user.email, {
            name: user.name ?? "User",
            tokenName: record.name,
            revokedAt: new Date().toLocaleString("en-US"),
          });
          if (sent.isFailure) di.IInstrumentation.capture(sent.getError());
        }
      }

      return { token_raw: entry.token, token_type: entry.type, label: "true_positive" } as const;
    }),
  );

  return c.json(results);
});
