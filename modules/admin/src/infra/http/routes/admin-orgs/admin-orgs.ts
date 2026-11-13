import { AppErrorException } from "@packages/ddd-kit";
import { idParamSchema } from "@packages/http/id-param";
import type { RouteEnv, RouteGuards } from "@packages/http/route-guards";
import { zV } from "@packages/http/validator";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ISsoEnforcement } from "../../../../application/ports/services/sso-enforcement.port";
import type { IGetOrgQuery } from "../../../../application/queries/get-org.query";
import type { IListOrgsQuery } from "../../../../application/queries/list-orgs.query";
import type { IListStaffNotesQuery } from "../../../../application/queries/list-staff-notes.query";
import { ssoEnforcementChangeNeedsStepUp } from "../../../../application/services/sso-enforcement-policy.service";
import type { AddStaffNoteUseCase } from "../../../../application/usecases/add-staff-note/add-staff-note.usecase";
import type { RevokePlanOverrideUseCase } from "../../../../application/usecases/revoke-plan-override/revoke-plan-override.usecase";
import type { SetPlanOverrideUseCase } from "../../../../application/usecases/set-plan-override/set-plan-override.usecase";
import { addStaffNoteBodySchema } from "../../staff-note.schema";
import { addedStaffNote, listedStaffNotes } from "../../staff-notes";
import {
  listOrgsQuerySchema,
  setPlanOverrideBodySchema,
  setSsoEnforcementBodySchema,
} from "./admin-orgs.schema";

export interface AdminOrgRoutesDeps {
  routeGuards: RouteGuards;
  IListOrgsQuery: IListOrgsQuery;
  IGetOrgQuery: IGetOrgQuery;
  IListStaffNotesQuery: IListStaffNotesQuery;
  SetPlanOverrideUseCase: Pick<SetPlanOverrideUseCase, "execute">;
  RevokePlanOverrideUseCase: Pick<RevokePlanOverrideUseCase, "execute">;
  AddStaffNoteUseCase: Pick<AddStaffNoteUseCase, "execute">;
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
        const result = await deps.IListOrgsQuery.execute(c.req.valid("query"));
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
    .get(
      "/:id",
      g.requireAuth,
      g.requireStaffPermission("orgs.read"),
      zV("param", idParamSchema),
      async (c) => {
        const result = await deps.IGetOrgQuery.execute({ organizationId: c.req.valid("param").id });
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
      },
    )
    .post(
      "/:id/plan-override",
      g.requireAuth,
      g.requireStaffPermission("billing.override"),
      g.requireStepUp,
      zV("json", setPlanOverrideBodySchema),
      zV("param", idParamSchema),
      async (c) => {
        const { tier, expiresAt, note } = c.req.valid("json");
        const result = await deps.SetPlanOverrideUseCase.execute({
          actorUserId: g.currentUserId(c),
          organizationId: c.req.valid("param").id,
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
      zV("param", idParamSchema),
      async (c) => {
        const result = await deps.RevokePlanOverrideUseCase.execute({
          actorUserId: g.currentUserId(c),
          organizationId: c.req.valid("param").id,
        });
        if (result.isFailure) throw new AppErrorException(result.getError());

        return c.json({ ok: true });
      },
    )
    .get(
      "/:id/notes",
      g.requireAuth,
      g.requireStaffPermission("orgs.read"),
      zV("param", idParamSchema),
      async (c) =>
        c.json(
          await listedStaffNotes(deps.IListStaffNotesQuery, {
            type: "org",
            id: c.req.valid("param").id,
          }),
        ),
    )
    .post(
      "/:id/notes",
      g.requireAuth,
      g.requireStaffPermission("notes.write"),
      zV("json", addStaffNoteBodySchema),
      zV("param", idParamSchema),
      async (c) =>
        c.json(
          await addedStaffNote(deps.AddStaffNoteUseCase, {
            actorUserId: g.currentUserId(c),
            subject: { type: "org", id: c.req.valid("param").id },
            body: c.req.valid("json").body,
          }),
        ),
    )
    .post(
      "/:id/sso-enforcement",
      g.requireAuth,
      g.requireStaffPermission("orgs.sso"),
      g.denyImpersonated,
      zV("json", setSsoEnforcementBodySchema),
      zV("param", idParamSchema),
      async (c) => {
        const body = c.req.valid("json");
        const { enforced } = body;
        if (ssoEnforcementChangeNeedsStepUp(body)) await g.assertStepUp(c);

        const result = await deps.AdminActionService.setSsoEnforcement({
          organizationId: c.req.valid("param").id,
          enforced,
          actorUserId: g.currentUserId(c),
          viaPlatformAdmin: true,
        });
        if (result.isFailure) throw new AppErrorException(result.getError());
        return c.json({ ok: true });
      },
    );
}
