import { AppErrorException, type IUseCase } from "@packages/ddd-kit";
import { zV } from "@packages/http/validator";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ApiTokenError } from "../../../../application/ports/repositories/api-token.port";
import type { IGithubKeyVerifier } from "../../../../application/ports/services/github-key-verifier.port";
import type {
  HandleLeakReportInput,
  LeakVerdict,
} from "../../../../application/usecases/handle-leak-report/handle-leak-report.dto";
import { githubSignatureHeadersSchema, scanPayloadSchema } from "./scanning.schema";

export interface ApiTokenScanningRoutesDeps {
  IGithubKeyVerifier: IGithubKeyVerifier;
  HandleLeakReportUseCase: IUseCase<HandleLeakReportInput, LeakVerdict[], ApiTokenError>;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new HTTPException(400, { message: "INVALID_BODY" });
  }
}

export function createApiTokenScanningRoutes(deps: ApiTokenScanningRoutesDeps): Hono {
  return new Hono().post("/github", zV("header", githubSignatureHeadersSchema), async (c) => {
    // raw-body: the GitHub signature covers the exact bytes, so they are verified before any parse
    const rawBody = await c.req.text();
    const headers = c.req.valid("header");
    const keyId = headers["github-public-key-identifier"];
    const signature = headers["github-public-key-signature"];

    if (!keyId || !signature) {
      throw new HTTPException(403, { message: "MISSING_SIGNATURE_HEADERS" });
    }

    const valid = await deps.IGithubKeyVerifier.verify(keyId, signature, rawBody);
    if (!valid) throw new HTTPException(403, { message: "INVALID_SIGNATURE" });

    const payload = scanPayloadSchema.safeParse(parseJson(rawBody));
    if (!payload.success) throw new HTTPException(400, { message: "INVALID_BODY" });

    const verdicts = await deps.HandleLeakReportUseCase.execute({ entries: payload.data });
    if (verdicts.isFailure) throw new AppErrorException(verdicts.getError());

    return c.json(verdicts.getValue());
  });
}
