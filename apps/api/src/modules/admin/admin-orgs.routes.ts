import { AppErrorException } from "@packages/ddd-kit";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { di } from "../../container";
import { type AuthVariables, requireAuth } from "../../shared/middleware/auth.middleware";
import { denyImpersonated } from "../../shared/middleware/deny-impersonated.middleware";
import {
  assertStepUp,
  requireStaffPermission,
  requireStepUp,
} from "../../shared/middleware/staff.middleware";
import {
  setSsoEnforcementBodySchema,
  ssoEnforcementChangeNeedsStepUp,
} from "../../shared/services/set-sso-enforcement.dto";
import { zV } from "../../shared/validator";
import { addStaffNoteBodySchema } from "./application/dto/add-staff-note.dto";
import { listOrgsQuerySchema } from "./application/dto/list-orgs.dto";
import { setPlanOverrideBodySchema } from "./application/dto/set-plan-override.dto";
import { serializeStaffNote } from "./staff-note-response";

export const adminOrgRoutes = new Hono<{ Variables: AuthVariables }>()
  .get(
    "/",
    requireAuth,
    requireStaffPermission("orgs.read"),
    zV("query", listOrgsQuerySchema),
    async (c) => {
      const result = await di.AdminQueryService.listOrgs(c.req.valid("query"));
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
  .get("/:id", requireAuth, requireStaffPermission("orgs.read"), async (c) => {
    const result = await di.AdminQueryService.getOrg(c.req.param("id"));
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
    requireAuth,
    requireStaffPermission("billing.override"),
    requireStepUp,
    zV("json", setPlanOverrideBodySchema),
    async (c) => {
      const { tier, expiresAt, note } = c.req.valid("json");
      const result = await di.PlanOverrideService.set({
        actorUserId: c.get("user").id,
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
    requireAuth,
    requireStaffPermission("billing.override"),
    requireStepUp,
    async (c) => {
      const result = await di.PlanOverrideService.revoke({
        actorUserId: c.get("user").id,
        organizationId: c.req.param("id"),
      });
      if (result.isFailure) throw new AppErrorException(result.getError());

      return c.json({ ok: true });
    },
  )
  .get("/:id/notes", requireAuth, requireStaffPermission("orgs.read"), async (c) => {
    const result = await di.StaffNoteService.list({ type: "org", id: c.req.param("id") });
    if (result.isFailure) throw new AppErrorException(result.getError());

    return c.json({ items: result.getValue().map(serializeStaffNote) });
  })
  .post(
    "/:id/notes",
    requireAuth,
    requireStaffPermission("notes.write"),
    zV("json", addStaffNoteBodySchema),
    async (c) => {
      const result = await di.StaffNoteService.add({
        actorUserId: c.get("user").id,
        subject: { type: "org", id: c.req.param("id") },
        body: c.req.valid("json").body,
      });
      if (result.isFailure) throw new AppErrorException(result.getError());

      return c.json({ ok: true });
    },
  )
  .post(
    "/:id/sso-enforcement",
    requireAuth,
    requireStaffPermission("orgs.sso"),
    denyImpersonated,
    zV("json", setSsoEnforcementBodySchema),
    async (c) => {
      const body = c.req.valid("json");
      const { enforced } = body;
      if (ssoEnforcementChangeNeedsStepUp(body))
        await assertStepUp(c.get("user"), c.get("session"));

      const result = await di.AdminActionService.setSsoEnforcement({
        organizationId: c.req.param("id"),
        enforced,
        actorUserId: c.get("user").id,
        viaPlatformAdmin: true,
      });
      if (result.isFailure) throw new AppErrorException(result.getError());
      return c.json({ ok: true });
    },
  );
