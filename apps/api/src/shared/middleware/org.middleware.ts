import {
  authorizeRole,
  ORG_ROLES,
  type OrgPermissions,
  type OrgRole,
} from "@packages/access-control";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { SessionData, SessionUser } from "../../auth";
import { findActiveMemberRole } from "../../auth-queries";

const orgRoleSchema = z.enum(ORG_ROLES);

const parseRole = (raw: string | null | undefined): OrgRole | undefined => {
  if (!raw) return undefined;
  const parsed = orgRoleSchema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
};

type OrgVariables = {
  user: SessionUser;
  session: SessionData;
  orgId: string;
  orgRole?: OrgRole;
};

export const requireOrg = createMiddleware<{ Variables: OrgVariables }>(async (c, next) => {
  const orgId = c.get("session")?.activeOrganizationId;
  if (!orgId) throw new HTTPException(403, { message: "No active organization" });

  const role = parseRole(await findActiveMemberRole(c.get("user").id, orgId));
  if (!role) throw new HTTPException(403, { message: "No active organization" });

  c.set("orgId", orgId);
  c.set("orgRole", role);
  await next();
});

export const requireOrgPermission = (permissions: OrgPermissions) =>
  createMiddleware<{ Variables: OrgVariables }>(async (c, next) => {
    const orgId = c.get("orgId");
    if (!orgId)
      throw new HTTPException(500, {
        message: "requireOrgPermission: orgId missing, chain requireOrg before",
      });

    const role = c.get("orgRole") ?? parseRole(await findActiveMemberRole(c.get("user").id, orgId));
    if (!authorizeRole(role, permissions))
      throw new HTTPException(403, { message: "Insufficient permission" });

    c.set("orgRole", role);
    await next();
  });
