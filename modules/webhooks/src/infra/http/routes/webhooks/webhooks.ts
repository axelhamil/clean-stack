import { type AppError, AppErrorException, type IUseCase } from "@packages/ddd-kit";
import { idParamSchema } from "@packages/http/id-param";
import type { RouteEnv, RouteGuards } from "@packages/http/route-guards";
import { zV } from "@packages/http/validator";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { WebhookDeliveryRecord } from "../../../../application/ports/repositories/webhook-delivery.port";
import type { WebhookEndpointRecord } from "../../../../application/ports/repositories/webhook-endpoint.port";
import type { IGetDeliveryQuery } from "../../../../application/queries/get-delivery.query";
import type { IListDeliveriesQuery } from "../../../../application/queries/list-deliveries.query";
import type { IListEndpointsQuery } from "../../../../application/queries/list-endpoints.query";
import type { TestDeliveryError } from "../../../../application/services/test-delivery.service";
import type {
  CreateEndpointError,
  CreateEndpointInput,
  CreateEndpointOutput,
} from "../../../../application/usecases/create-endpoint/create-endpoint.dto";
import type {
  DeleteEndpointError,
  DeleteEndpointInput,
} from "../../../../application/usecases/delete-endpoint/delete-endpoint.dto";
import type {
  ReplayDeliveryError,
  ReplayDeliveryInput,
} from "../../../../application/usecases/replay-delivery/replay-delivery.dto";
import type {
  RotateEndpointSecretError,
  RotateEndpointSecretInput,
  RotateEndpointSecretOutput,
} from "../../../../application/usecases/rotate-endpoint-secret/rotate-endpoint-secret.dto";
import type { SendTestDeliveryInput } from "../../../../application/usecases/send-test-delivery/send-test-delivery.dto";
import type {
  UpdateEndpointError,
  UpdateEndpointInput,
} from "../../../../application/usecases/update-endpoint/update-endpoint.dto";
import { toDeliveryDetailJson, toDeliveryJson, toEndpointJson } from "./webhooks.presenter";
import {
  createEndpointBodySchema,
  deliveryParamSchema,
  listDeliveriesQuerySchema,
  updateEndpointBodySchema,
} from "./webhooks.schema";

export interface WebhooksRoutesDeps {
  routeGuards: RouteGuards;
  CreateEndpointUseCase: IUseCase<CreateEndpointInput, CreateEndpointOutput, CreateEndpointError>;
  UpdateEndpointUseCase: IUseCase<UpdateEndpointInput, WebhookEndpointRecord, UpdateEndpointError>;
  DeleteEndpointUseCase: IUseCase<DeleteEndpointInput, void, DeleteEndpointError>;
  SendTestDeliveryUseCase: IUseCase<
    SendTestDeliveryInput,
    WebhookDeliveryRecord,
    TestDeliveryError
  >;
  RotateEndpointSecretUseCase: IUseCase<
    RotateEndpointSecretInput,
    RotateEndpointSecretOutput,
    RotateEndpointSecretError
  >;
  ReplayDeliveryUseCase: IUseCase<ReplayDeliveryInput, WebhookDeliveryRecord, ReplayDeliveryError>;
  IListEndpointsQuery: IListEndpointsQuery;
  IListDeliveriesQuery: IListDeliveriesQuery;
  IGetDeliveryQuery: IGetDeliveryQuery;
}

const NOT_FOUND_CODES: readonly string[] = [
  "WEBHOOK_ENDPOINT_NOT_FOUND",
  "WEBHOOK_DELIVERY_NOT_FOUND",
];

function rejectWith(error: AppError): never {
  if (NOT_FOUND_CODES.includes(error.code))
    throw new HTTPException(404, { message: error.message });
  throw new AppErrorException(error);
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
        const result = await deps.IListEndpointsQuery.execute({
          organizationId: g.currentOrgId(c),
        });
        if (result.isFailure) return rejectWith(result.getError());

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
        const body = c.req.valid("json");
        const result = await deps.CreateEndpointUseCase.execute({
          organizationId: g.currentOrgId(c),
          actorUserId: g.currentUserId(c),
          url: body.url,
          eventTypes: body.eventTypes,
          enabled: body.enabled,
        });
        if (result.isFailure) return rejectWith(result.getError());

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
      zV("param", idParamSchema),
      async (c) => {
        const { id } = c.req.valid("param");
        const body = c.req.valid("json");
        const result = await deps.UpdateEndpointUseCase.execute({
          id,
          organizationId: g.currentOrgId(c),
          actorUserId: g.currentUserId(c),
          ...body,
        });
        if (result.isFailure) return rejectWith(result.getError());

        return c.json(toEndpointJson(result.getValue()));
      },
    )
    .delete(
      "/:id",
      g.requireAuth,
      g.requireCurrentPolicies,
      g.denyImpersonated,
      g.requireOrg,
      g.requireOrgPermission({ webhooks: ["write"] }),
      zV("param", idParamSchema),
      async (c) => {
        const { id } = c.req.valid("param");
        const result = await deps.DeleteEndpointUseCase.execute({
          id,
          organizationId: g.currentOrgId(c),
          actorUserId: g.currentUserId(c),
        });
        if (result.isFailure) return rejectWith(result.getError());

        return c.json({ deleted: true });
      },
    )
    .get(
      "/:id/deliveries",
      g.requireAuth,
      g.requireOrg,
      g.requireOrgPermission({ webhooks: ["read"] }),
      zV("query", listDeliveriesQuerySchema),
      zV("param", idParamSchema),
      async (c) => {
        const { id } = c.req.valid("param");
        const filters = c.req.valid("query");
        const result = await deps.IListDeliveriesQuery.execute({
          endpointId: id,
          organizationId: g.currentOrgId(c),
          status: filters.status,
          limit: filters.limit,
          cursor: filters.cursor,
        });
        if (result.isFailure) return rejectWith(result.getError());

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
      zV("param", deliveryParamSchema),
      async (c) => {
        const { id, deliveryId } = c.req.valid("param");
        const result = await deps.IGetDeliveryQuery.execute({
          deliveryId,
          endpointId: id,
          organizationId: g.currentOrgId(c),
        });
        if (result.isFailure) return rejectWith(result.getError());

        return c.json(toDeliveryDetailJson(result.getValue()));
      },
    )
    .post(
      "/:id/test",
      g.requireAuth,
      g.requireCurrentPolicies,
      g.denyImpersonated,
      g.requireOrg,
      g.requireOrgPermission({ webhooks: ["write"] }),
      zV("param", idParamSchema),
      async (c) => {
        const { id } = c.req.valid("param");
        const result = await deps.SendTestDeliveryUseCase.execute({
          id,
          organizationId: g.currentOrgId(c),
          actorUserId: g.currentUserId(c),
        });
        if (result.isFailure) return rejectWith(result.getError());

        return c.json(toDeliveryJson(result.getValue()), 201);
      },
    )
    .post(
      "/:id/rotate-secret",
      g.requireAuth,
      g.requireCurrentPolicies,
      g.denyImpersonated,
      g.requireOrg,
      g.requireOrgPermission({ webhooks: ["write"] }),
      zV("param", idParamSchema),
      async (c) => {
        const { id } = c.req.valid("param");
        const result = await deps.RotateEndpointSecretUseCase.execute({
          id,
          organizationId: g.currentOrgId(c),
          actorUserId: g.currentUserId(c),
        });
        if (result.isFailure) return rejectWith(result.getError());

        const { endpoint, plaintextSecret } = result.getValue();

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
      zV("param", deliveryParamSchema),
      async (c) => {
        const { id, deliveryId } = c.req.valid("param");
        const result = await deps.ReplayDeliveryUseCase.execute({
          deliveryId,
          endpointId: id,
          organizationId: g.currentOrgId(c),
          actorUserId: g.currentUserId(c),
        });
        if (result.isFailure) return rejectWith(result.getError());

        return c.json(toDeliveryJson(result.getValue()), 201);
      },
    );
}
