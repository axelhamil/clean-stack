import { AppErrorException } from "@packages/ddd-kit";
import type { RouteEnv, RouteGuards } from "@packages/http/route-guards";
import { zV } from "@packages/http/validator";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { addStaffNoteBodySchema } from "../../application/dto/add-staff-note.dto";
import { listOrgsQuerySchema } from "../../application/dto/list-orgs.dto";
import { setPlanOverrideBodySchema } from "../../application/dto/set-plan-override.dto";
import {
  setSsoEnforcementBodySchema,
  ssoEnforcementChangeNeedsStepUp,
} from "../../application/dto/set-sso-enforcement.dto";
import type { ISsoEnforcement } from "../../application/ports/sso-enforcement.port";
import type { AdminQueryService } from "../../application/services/admin-query.service";
import type { PlanOverrideService } from "../../application/services/plan-override.service";
import type { StaffNoteService } from "../../application/services/staff-note.service";
import { serializeStaffNote } from "./staff-note-response";

export interface AdminOrgRoutesDeps {
  routeGuards: RouteGuards;
  AdminQueryService: Pick<AdminQueryService, "listOrgs" | "getOrg">;
  PlanOverrideService: Pick<PlanOverrideService, "set" | "revoke">;
  StaffNoteService: Pick<StaffNoteService, "list" | "add">;
  AdminActionService: ISsoEnforcement;
}

export function createAdminOrgRoutes(deps: AdminOrgRoutesDeps) {
  const { routeGuards: g } = deps;

  return new Hono<RouteEnv>()
    .get(
      "/",
      g.requireAuth,
      g.requireStaffPermission("orgs.read"),
      zV("query", listOrgsQuerySchema),
      async (c) => {
        const result = await deps.AdminQueryService.listOrgs(c.req.valid("query"));
        if (result.isFailure) throw new AppErrorException(result.getError());
        const page = result.getValue();
        return c.json({
          items: page.items.map(({ cursorAt: _cursorAt, ...o }) => ({
            ...o,
            createdAt: o.createdAt.toISOString(),
          })),
          nextCursor: page.nextCursor.toNull(),
        });
      },
    )
    .get("/:id", g.requireAuth, g.requireStaffPermission("orgs.read"), async (c) => {
      const result = await deps.AdminQueryService.getOrg(c.req.param("id"));
      if (result.isFailure) throw new AppErrorException(result.getError());
      const found = result.getValue();
      if (found.isNone()) throw new HTTPException(404, { message: "ADMIN_ORG_NOT_FOUND" });
      const o = found.unwrap();
      return c.json({
        ...o,
        createdAt: o.createdAt.toISOString(),
        planOverride: o.planOverride
          .map((active) => ({
            tier: active.tier,
            note: active.note,
            expiresAt: active.expiresAt.toISOString(),
          }))
          .toNull(),
      });
    })
    .post(
      "/:id/plan-override",
      g.requireAuth,
      g.requireStaffPermission("billing.override"),
      g.requireStepUp,
      zV("json", setPlanOverrideBodySchema),
      async (c) => {
        const { tier, expiresAt, note } = c.req.valid("json");
        const result = await deps.PlanOverrideService.set({
          actorUserId: g.currentUserId(c),
          organizationId: c.req.param("id"),
          tier,
          expiresAt: new Date(expiresAt),
          note,
        });
        if (result.isFailure) throw new AppErrorException(result.getError());

        return c.json({ ok: true });
      },
    )
    .delete(
      "/:id/plan-override",
      g.requireAuth,
      g.requireStaffPermission("billing.override"),
      g.requireStepUp,
      async (c) => {
        const result = await deps.PlanOverrideService.revoke({
          actorUserId: g.currentUserId(c),
          organizationId: c.req.param("id"),
        });
        if (result.isFailure) throw new AppErrorException(result.getError());

        return c.json({ ok: true });
      },
    )
    .get("/:id/notes", g.requireAuth, g.requireStaffPermission("orgs.read"), async (c) => {
      const result = await deps.StaffNoteService.list({ type: "org", id: c.req.param("id") });
      if (result.isFailure) throw new AppErrorException(result.getError());

      return c.json({ items: result.getValue().map(serializeStaffNote) });
    })
    .post(
      "/:id/notes",
      g.requireAuth,
      g.requireStaffPermission("notes.write"),
      zV("json", addStaffNoteBodySchema),
      async (c) => {
        const result = await deps.StaffNoteService.add({
          actorUserId: g.currentUserId(c),
          subject: { type: "org", id: c.req.param("id") },
          body: c.req.valid("json").body,
        });
        if (result.isFailure) throw new AppErrorException(result.getError());

        return c.json({ ok: true });
      },
    )
    .post(
      "/:id/sso-enforcement",
      g.requireAuth,
      g.requireStaffPermission("orgs.sso"),
      g.denyImpersonated,
      zV("json", setSsoEnforcementBodySchema),
      async (c) => {
        const body = c.req.valid("json");
        const { enforced } = body;
        if (ssoEnforcementChangeNeedsStepUp(body)) await g.assertStepUp(c);

        const result = await deps.AdminActionService.setSsoEnforcement({
          organizationId: c.req.param("id"),
          enforced,
          actorUserId: g.currentUserId(c),
          viaPlatformAdmin: true,
        });
        if (result.isFailure) throw new AppErrorException(result.getError());
        return c.json({ ok: true });
      },
    );
}
