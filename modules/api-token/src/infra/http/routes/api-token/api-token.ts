import { AppErrorException, type IUseCase } from "@packages/ddd-kit";
import { idParamSchema } from "@packages/http/id-param";
import type { RouteEnv, RouteGuards } from "@packages/http/route-guards";
import { zV } from "@packages/http/validator";
import { Hono } from "hono";
import { every } from "hono/combine";
import type { ApiTokenError } from "../../../../application/ports/repositories/api-token.port";
import type { IListApiTokensQuery } from "../../../../application/queries/list-api-tokens.query";
import type {
  CreateApiTokenInput,
  CreateApiTokenOutput,
} from "../../../../application/usecases/create-api-token/create-api-token.dto";
import type { RevokeApiTokenInput } from "../../../../application/usecases/revoke-api-token/revoke-api-token.dto";
import { tokenOwnerForSession } from "../../../../domain/api-token/services/token-visibility.service";
import { toTokenJson } from "./api-token.presenter";
import { createTokenBodySchema } from "./api-token.schema";

export interface ApiTokenRoutesDeps {
  routeGuards: RouteGuards;
  CreateApiTokenUseCase: IUseCase<CreateApiTokenInput, CreateApiTokenOutput, ApiTokenError>;
  RevokeApiTokenUseCase: IUseCase<RevokeApiTokenInput, void, ApiTokenError>;
  IListApiTokensQuery: IListApiTokensQuery;
}

export function createApiTokenRoutes(deps: ApiTokenRoutesDeps) {
  const { routeGuards: g } = deps;
  const requireTokenCreationInOrg = every(
    g.requireOrg,
    g.requireOrgPermission({ apiToken: ["create"] }),
  );

  return new Hono<RouteEnv>()
    .get("/", g.requireAuth, async (c) => {
      const owner = tokenOwnerForSession(g.currentUserId(c), g.activeOrgId(c));
      const result = await deps.IListApiTokensQuery.execute({ owner });
      if (result.isFailure) throw new AppErrorException(result.getError());

      return c.json({ items: result.getValue().map(toTokenJson) });
    })
    .post(
      "/",
      g.requireAuth,
      g.requireCurrentPolicies,
      g.denyImpersonated,
      zV("json", createTokenBodySchema),
      async (c) => {
        const body = c.req.valid("json");
        const userId = g.currentUserId(c);

        if (body.organizationId !== null) {
          if (g.activeOrgId(c).toNull() !== body.organizationId) {
            throw new AppErrorException({
              code: "API_TOKEN_ORGANIZATION_NOT_FOUND",
              message: "Switch to this organization before creating a token for it.",
            });
          }
          await requireTokenCreationInOrg(c, async () => {});
        }

        const result = await deps.CreateApiTokenUseCase.execute({
          userId,
          actorUserId: userId,
          name: body.name,
          scopes: body.scopes,
          organizationId: body.organizationId,
          expiresInDays: body.expiresInDays,
        });
        if (result.isFailure) throw new AppErrorException(result.getError());

        const { token, raw } = result.getValue();

        return c.json({ token: raw, record: toTokenJson(token) }, 201);
      },
    )
    .delete(
      "/:id",
      g.requireAuth,
      g.requireCurrentPolicies,
      g.denyImpersonated,
      zV("param", idParamSchema),
      async (c) => {
        const userId = g.currentUserId(c);
        const result = await deps.RevokeApiTokenUseCase.execute({
          id: c.req.valid("param").id,
          owner: tokenOwnerForSession(userId, g.activeOrgId(c)),
          actorUserId: userId,
        });
        if (result.isFailure) throw new AppErrorException(result.getError());

        return c.json({ deleted: true });
      },
    );
}
