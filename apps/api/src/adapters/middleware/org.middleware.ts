import {
  authorizeRole,
  ORG_ROLES,
  type OrgPermissions,
  type OrgRole,
} from "@packages/access-control";
import { and, db, eq, schema } from "@packages/drizzle";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { SessionData, SessionUser } from "../../auth";

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
  const session = c.get("session");
  if (!session?.activeOrganizationId)
    throw new HTTPException(403, { message: "No active organization" });

  c.set("orgId", session.activeOrganizationId);
  await next();
});

async function resolveRole(
  c: Context<{ Variables: OrgVariables }>,
  orgId: string,
  userId: string,
): Promise<OrgRole | undefined> {
  const cached = c.get("orgRole");
  if (cached) return cached;

  const session = c.get("session") as
    | (SessionData & { activeOrganizationRole?: string | null })
    | null
    | undefined;
  if (session?.activeOrganizationId === orgId) {
    const fromSession = parseRole(session.activeOrganizationRole);
    if (fromSession) return fromSession;
  }

  const [row] = await db
    .select({ role: schema.member.role })
    .from(schema.member)
    .where(and(eq(schema.member.organizationId, orgId), eq(schema.member.userId, userId)));
  return parseRole(row?.role);
}

export const requireOrgPermission = (permissions: OrgPermissions) =>
  createMiddleware<{ Variables: OrgVariables }>(async (c, next) => {
    const orgId = c.get("orgId");
    if (!orgId)
      throw new HTTPException(500, {
        message: "requireOrgPermission: orgId missing — chain requireOrg before",
      });

    const role = await resolveRole(c, orgId, c.get("user").id);
    if (!authorizeRole(role, permissions))
      throw new HTTPException(403, { message: "Insufficient permission" });

    c.set("orgRole", role);
    await next();
  });
