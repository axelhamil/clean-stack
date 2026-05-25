import { AppErrorException } from "@packages/ddd-kit";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { di } from "../../container";
import { type AuthVariables, requireAuth } from "../../shared/middleware/auth.middleware";
import { requireOrg, requireOrgPermission } from "../../shared/middleware/org.middleware";
import { zV } from "../../shared/validator";
import { createEndpointBodySchema } from "./application/dto/create-endpoint.dto";
import { listDeliveriesQuerySchema } from "./application/dto/list-deliveries.dto";
import { updateEndpointBodySchema } from "./application/dto/update-endpoint.dto";

type Vars = AuthVariables & { orgId: string };

export const webhooksRoutes = new Hono<{ Variables: Vars }>()
  .get("/", requireAuth, requireOrg, requireOrgPermission({ webhooks: ["read"] }), async (c) => {
    const orgId = c.get("orgId");
    const items = await di.WebhooksService.listEndpoints(orgId);
    return c.json({
      items: items.map(({ secretCipher: _s, ...rest }) => rest),
    });
  })
  .post(
    "/",
    requireAuth,
    requireOrg,
    requireOrgPermission({ webhooks: ["write"] }),
    zV("json", createEndpointBodySchema),
    async (c) => {
      const orgId = c.get("orgId");
      const body = c.req.valid("json");
      const result = await di.WebhooksService.createEndpoint({
        organizationId: orgId,
        actorUserId: c.get("user").id,
        url: body.url,
        eventTypes: body.eventTypes,
        enabled: body.enabled,
      });
      if (result.isFailure) throw new AppErrorException(result.getError());
      const { endpoint, plaintextSecret } = result.getValue();
      const { secretCipher: _s, ...rest } = endpoint;
      return c.json({ ...rest, secret: plaintextSecret }, 201);
    },
  )
  .patch(
    "/:id",
    requireAuth,
    requireOrg,
    requireOrgPermission({ webhooks: ["write"] }),
    zV("json", updateEndpointBodySchema),
    async (c) => {
      const orgId = c.get("orgId");
      const id = c.req.param("id");
      const body = c.req.valid("json");
      const result = await di.WebhooksService.updateEndpoint({
        id,
        organizationId: orgId,
        actorUserId: c.get("user").id,
        ...body,
      });
      if (result.isNone()) throw new HTTPException(404, { message: "Webhook endpoint not found" });
      const { secretCipher: _s, ...rest } = result.unwrap();
      return c.json(rest);
    },
  )
  .delete(
    "/:id",
    requireAuth,
    requireOrg,
    requireOrgPermission({ webhooks: ["write"] }),
    async (c) => {
      const orgId = c.get("orgId");
      const id = c.req.param("id");
      const deleted = await di.WebhooksService.deleteEndpoint(id, orgId, c.get("user").id);
      if (!deleted) throw new HTTPException(404, { message: "Webhook endpoint not found" });
      return c.json({ deleted: true });
    },
  )
  .get(
    "/:id/deliveries",
    requireAuth,
    requireOrg,
    requireOrgPermission({ webhooks: ["read"] }),
    zV("query", listDeliveriesQuerySchema),
    async (c) => {
      const orgId = c.get("orgId");
      const endpointId = c.req.param("id");
      const endpoint = await di.WebhooksService.findEndpoint(endpointId, orgId);
      if (endpoint.isNone())
        throw new HTTPException(404, { message: "Webhook endpoint not found" });
      const filters = c.req.valid("query");
      const page = await di.WebhooksService.listDeliveries({
        endpointId,
        organizationId: orgId,
        status: filters.status,
        limit: filters.limit,
        cursor: filters.cursor,
      });
      return c.json({
        items: page.items.map(({ payload: _p, ...rest }) => rest),
        nextCursor: page.nextCursor,
      });
    },
  )
  .post(
    "/:id/deliveries/:deliveryId/replay",
    requireAuth,
    requireOrg,
    requireOrgPermission({ webhooks: ["write"] }),
    async (c) => {
      const orgId = c.get("orgId");
      const endpointId = c.req.param("id");
      const deliveryId = c.req.param("deliveryId");
      const endpoint = await di.WebhooksService.findEndpoint(endpointId, orgId);
      if (endpoint.isNone())
        throw new HTTPException(404, { message: "Webhook endpoint not found" });
      const replayed = await di.WebhooksService.replayDelivery(deliveryId, orgId);
      if (replayed.isNone())
        throw new HTTPException(404, { message: "Webhook delivery not found" });
      const { payload: _p, ...rest } = replayed.unwrap();
      return c.json(rest, 201);
    },
  );
