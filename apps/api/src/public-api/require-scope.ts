import type { ApiScope } from "@modules/api-token/contracts/create-token";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import type { ApiTokenVariables } from "../shared/middleware/api-token.middleware";

export const requireScope = (scope: ApiScope) =>
  createMiddleware<{ Variables: ApiTokenVariables }>(async (c, next) => {
    const scopes: ApiScope[] = (c.get("tokenScopes") as ApiScope[] | undefined) ?? [];
    if (!scopes.includes(scope)) {
      throw new HTTPException(403, { message: "Forbidden" });
    }
    await next();
  });
