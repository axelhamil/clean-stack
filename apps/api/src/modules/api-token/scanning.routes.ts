import { AppErrorException } from "@packages/ddd-kit";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { TokenLeakService } from "./application/services/token-leak.service";
import type { GithubKeyVerifier } from "./infrastructure/services/github-key-verifier";

export interface ApiTokenScanningRoutesDeps {
  GithubKeyVerifier: Pick<GithubKeyVerifier, "verify">;
  TokenLeakService: Pick<TokenLeakService, "handleReport">;
}

const scanPayloadSchema = z.array(
  z.object({ token: z.string(), type: z.string(), url: z.string().optional() }),
);

export function createApiTokenScanningRoutes(deps: ApiTokenScanningRoutesDeps): Hono {
  return new Hono().post("/github", async (c) => {
    const rawBody = await c.req.text();

    const keyId = c.req.header("GITHUB-PUBLIC-KEY-IDENTIFIER");
    const sigB64 = c.req.header("GITHUB-PUBLIC-KEY-SIGNATURE");

    if (!keyId || !sigB64) {
      throw new HTTPException(403, { message: "MISSING_SIGNATURE_HEADERS" });
    }

    const valid = await deps.GithubKeyVerifier.verify(keyId, sigB64, rawBody);
    if (!valid) throw new HTTPException(403, { message: "INVALID_SIGNATURE" });

    let json: unknown;
    try {
      json = JSON.parse(rawBody);
    } catch {
      throw new HTTPException(400, { message: "INVALID_BODY" });
    }

    const payload = scanPayloadSchema.safeParse(json);
    if (!payload.success) throw new HTTPException(400, { message: "INVALID_BODY" });

    const verdicts = await deps.TokenLeakService.handleReport(payload.data);
    if (verdicts.isFailure) throw new AppErrorException(verdicts.getError());

    return c.json(verdicts.getValue());
  });
}
