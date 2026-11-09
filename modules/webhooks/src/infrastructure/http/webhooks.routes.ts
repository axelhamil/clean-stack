import { AppErrorException } from "@packages/ddd-kit";
import type { RouteEnv, RouteGuards } from "@packages/http/route-guards";
import { zV } from "@packages/http/validator";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { createEndpointBodySchema } from "../../application/dto/create-endpoint.dto";
import { listDeliveriesQuerySchema } from "../../application/dto/list-deliveries.dto";
import { updateEndpointBodySchema } from "../../application/dto/update-endpoint.dto";
import type { WebhookDeliveryRecord } from "../../application/ports/webhook-delivery.port";
import type { WebhookEndpointRecord } from "../../application/ports/webhook-endpoint.port";
import type { WebhooksService } from "../../application/services/webhooks.service";

export interface WebhooksRoutesDeps {
  routeGuards: RouteGuards;
  WebhooksService: Pick<
    WebhooksService,
    | "listEndpoints"
    | "createEndpoint"
    | "findEndpoint"
    | "updateEndpoint"
    | "deleteEndpoint"
    | "listDeliveries"
    | "findDelivery"
    | "sendTest"
    | "rotateSecret"
    | "replayDelivery"
  >;
}

/**
 * Both secret ciphers stay server-side: the previous one is still a live signing
 * key for the whole grace window, so it is exactly as sensitive as the current one.
 */
function toEndpointJson({
  secretCipher: _secretCipher,
  previousSecretCipher: _previousSecretCipher,
  previousSecretExpiresAt,
  firstFailedAt,
  disabledAt,
  ...rest
}: WebhookEndpointRecord) {
  return {
    ...rest,
    previousSecretExpiresAt: previousSecretExpiresAt.toNull(),
    firstFailedAt: firstFailedAt.toNull(),
    disabledAt: disabledAt.toNull(),
  };
}

function toDeliveryJson({
  payload: _payload,
  nextAttemptAt,
  lastError,
  lastResponseStatus,
  ...rest
}: WebhookDeliveryRecord) {
  return {
    ...rest,
    nextAttemptAt: nextAttemptAt.toNull(),
    lastError: lastError.toNull(),
    lastResponseStatus: lastResponseStatus.toNull(),
  };
}

export function createWebhooksRoutes(deps: WebhooksRoutesDeps) {
  const { routeGuards: g } = deps;

  return new Hono<RouteEnv>()
    .get(
      "/",
      g.requireAuth,
      g.requireOrg,
      g.requireOrgPermission({ webhooks: ["read"] }),
      async (c) => {
        const orgId = g.currentOrgId(c);
        const result = await deps.WebhooksService.listEndpoints(orgId);
        if (result.isFailure) throw new AppErrorException(result.getError());
        return c.json({ items: result.getValue().map(toEndpointJson) });
      },
    )
    .post(
      "/",
      g.requireAuth,
      g.requireCurrentPolicies,
      g.denyImpersonated,
      g.requireOrg,
      g.requireOrgPermission({ webhooks: ["write"] }),
      zV("json", createEndpointBodySchema),
      async (c) => {
        const orgId = g.currentOrgId(c);
        const body = c.req.valid("json");
        const result = await deps.WebhooksService.createEndpoint({
          organizationId: orgId,
          actorUserId: g.currentUserId(c),
          url: body.url,
          eventTypes: body.eventTypes,
          enabled: body.enabled,
        });
        if (result.isFailure) throw new AppErrorException(result.getError());
        const { endpoint, plaintextSecret } = result.getValue();
        return c.json({ ...toEndpointJson(endpoint), secret: plaintextSecret }, 201);
      },
    )
    .patch(
      "/:id",
      g.requireAuth,
      g.requireCurrentPolicies,
      g.denyImpersonated,
      g.requireOrg,
      g.requireOrgPermission({ webhooks: ["write"] }),
      zV("json", updateEndpointBodySchema),
      async (c) => {
        const orgId = g.currentOrgId(c);
        const id = c.req.param("id");
        const body = c.req.valid("json");
        const result = await deps.WebhooksService.updateEndpoint({
          id,
          organizationId: orgId,
          actorUserId: g.currentUserId(c),
          ...body,
        });
        if (result.isFailure) throw new AppErrorException(result.getError());
        const opt = result.getValue();
        if (opt.isNone()) throw new HTTPException(404, { message: "Webhook endpoint not found" });
        return c.json(toEndpointJson(opt.unwrap()));
      },
    )
    .delete(
      "/:id",
      g.requireAuth,
      g.requireCurrentPolicies,
      g.denyImpersonated,
      g.requireOrg,
      g.requireOrgPermission({ webhooks: ["write"] }),
      async (c) => {
        const orgId = g.currentOrgId(c);
        const id = c.req.param("id");
        const result = await deps.WebhooksService.deleteEndpoint(id, orgId, g.currentUserId(c));
        if (result.isFailure) throw new AppErrorException(result.getError());
        if (!result.getValue())
          throw new HTTPException(404, { message: "Webhook endpoint not found" });
        return c.json({ deleted: true });
      },
    )
    .get(
      "/:id/deliveries",
      g.requireAuth,
      g.requireOrg,
      g.requireOrgPermission({ webhooks: ["read"] }),
      zV("query", listDeliveriesQuerySchema),
      async (c) => {
        const orgId = g.currentOrgId(c);
        const endpointId = c.req.param("id");
        const endpoint = await deps.WebhooksService.findEndpoint(endpointId, orgId);
        if (endpoint.isFailure) throw new AppErrorException(endpoint.getError());
        if (endpoint.getValue().isNone())
          throw new HTTPException(404, { message: "Webhook endpoint not found" });
        const filters = c.req.valid("query");
        const result = await deps.WebhooksService.listDeliveries({
          endpointId,
          organizationId: orgId,
          status: filters.status,
          limit: filters.limit,
          cursor: filters.cursor,
        });
        if (result.isFailure) throw new AppErrorException(result.getError());
        const page = result.getValue();
        return c.json({
          items: page.items.map(toDeliveryJson),
          nextCursor: page.nextCursor.toNull(),
        });
      },
    )
    .get(
      "/:id/deliveries/:deliveryId",
      g.requireAuth,
      g.requireOrg,
      g.requireOrgPermission({ webhooks: ["read"] }),
      async (c) => {
        const orgId = g.currentOrgId(c);
        const id = c.req.param("id");
        const deliveryId = c.req.param("deliveryId");
        const endpoint = await deps.WebhooksService.findEndpoint(id, orgId);
        if (endpoint.isFailure) throw new AppErrorException(endpoint.getError());
        if (endpoint.getValue().isNone())
          throw new HTTPException(404, { message: "Webhook endpoint not found" });
        const found = await deps.WebhooksService.findDelivery(deliveryId, id, orgId);
        if (found.isFailure) throw new AppErrorException(found.getError());
        const opt = found.getValue();
        if (opt.isNone()) throw new HTTPException(404, { message: "Webhook delivery not found" });
        const delivery = opt.unwrap();
        const { nextAttemptAt, lastError, lastResponseStatus, attemptHistory, ...rest } = delivery;
        return c.json({
          ...rest,
          nextAttemptAt: nextAttemptAt.toNull(),
          lastError: lastError.toNull(),
          lastResponseStatus: lastResponseStatus.toNull(),
          attemptHistory: attemptHistory.map(
            ({
              requestHeaders,
              requestBody,
              responseStatus,
              responseHeaders,
              responseBody,
              durationMs,
              error,
              ...a
            }) => ({
              ...a,
              requestHeaders: requestHeaders.toNull(),
              requestBody: requestBody.toNull(),
              responseStatus: responseStatus.toNull(),
              responseHeaders: responseHeaders.toNull(),
              responseBody: responseBody.toNull(),
              durationMs: durationMs.toNull(),
              error: error.toNull(),
            }),
          ),
        });
      },
    )
    .post(
      "/:id/test",
      g.requireAuth,
      g.requireCurrentPolicies,
      g.denyImpersonated,
      g.requireOrg,
      g.requireOrgPermission({ webhooks: ["write"] }),
      async (c) => {
        const orgId = g.currentOrgId(c);
        const id = c.req.param("id");
        const result = await deps.WebhooksService.sendTest({
          id,
          organizationId: orgId,
          actorUserId: g.currentUserId(c),
        });
        if (result.isFailure) throw new AppErrorException(result.getError());
        const opt = result.getValue();
        if (opt.isNone()) throw new HTTPException(404, { message: "Webhook endpoint not found" });
        return c.json(toDeliveryJson(opt.unwrap()), 201);
      },
    )
    .post(
      "/:id/rotate-secret",
      g.requireAuth,
      g.requireCurrentPolicies,
      g.denyImpersonated,
      g.requireOrg,
      g.requireOrgPermission({ webhooks: ["write"] }),
      async (c) => {
        const orgId = g.currentOrgId(c);
        const id = c.req.param("id");
        const result = await deps.WebhooksService.rotateSecret({
          id,
          organizationId: orgId,
          actorUserId: g.currentUserId(c),
        });
        if (result.isFailure) throw new AppErrorException(result.getError());
        const opt = result.getValue();
        if (opt.isNone()) throw new HTTPException(404, { message: "Webhook endpoint not found" });
        const { endpoint, plaintextSecret } = opt.unwrap();
        return c.json({ ...toEndpointJson(endpoint), secret: plaintextSecret });
      },
    )
    .post(
      "/:id/deliveries/:deliveryId/replay",
      g.requireAuth,
      g.requireCurrentPolicies,
      g.denyImpersonated,
      g.requireOrg,
      g.requireOrgPermission({ webhooks: ["write"] }),
      async (c) => {
        const orgId = g.currentOrgId(c);
        const endpointId = c.req.param("id");
        const deliveryId = c.req.param("deliveryId");
        const endpoint = await deps.WebhooksService.findEndpoint(endpointId, orgId);
        if (endpoint.isFailure) throw new AppErrorException(endpoint.getError());
        if (endpoint.getValue().isNone())
          throw new HTTPException(404, { message: "Webhook endpoint not found" });
        const result = await deps.WebhooksService.replayDelivery(
          deliveryId,
          endpointId,
          orgId,
          g.currentUserId(c),
        );
        if (result.isFailure) throw new AppErrorException(result.getError());
        const opt = result.getValue();
        if (opt.isNone()) throw new HTTPException(404, { message: "Webhook delivery not found" });
        return c.json(toDeliveryJson(opt.unwrap()), 201);
      },
    );
}
