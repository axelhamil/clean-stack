import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import type { ApiScope } from "../modules/api-token/application/dto/create-token.dto";
import type { ApiTokenVariables } from "../shared/middleware/api-token.middleware";

export const requireScope = (scope: ApiScope) =>
  createMiddleware<{ Variables: ApiTokenVariables }>(async (c, next) => {
    if (!(c.get("tokenScopes") as ApiScope[]).includes(scope)) {
      throw new HTTPException(403, { message: "Forbidden" });
    }
    await next();
  });
