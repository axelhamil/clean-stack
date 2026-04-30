import { authorizeRole, type OrgPermissions, type OrgRole } from "@packages/access-control";
import type { AnyPgTable } from "@packages/drizzle";
import { and, db, eq, schema } from "@packages/drizzle";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { SessionData, SessionUser } from "../../auth";

const ORG_ROLES = ["owner", "admin", "member"] as const satisfies readonly OrgRole[];
const orgRoleSchema = z.enum(ORG_ROLES);

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

async function loadRole(orgId: string, userId: string): Promise<OrgRole | undefined> {
  const [row] = await db
    .select({ role: schema.member.role })
    .from(schema.member)
    .where(and(eq(schema.member.organizationId, orgId), eq(schema.member.userId, userId)));
  if (!row) return undefined;
  const parsed = orgRoleSchema.safeParse(row.role);
  return parsed.success ? parsed.data : undefined;
}

export const requireOrgPermission = (permissions: OrgPermissions) =>
  createMiddleware<{ Variables: OrgVariables }>(async (c, next) => {
    const orgId = c.get("orgId");
    if (!orgId)
      throw new HTTPException(500, {
        message: "requireOrgPermission: orgId missing — chain requireOrg before",
      });

    const role = await loadRole(orgId, c.get("user").id);
    if (!authorizeRole(role, permissions))
      throw new HTTPException(403, { message: "Insufficient permission" });

    c.set("orgRole", role);
    await next();
  });

interface OwnershipResource {
  // biome-ignore lint/suspicious/noExplicitAny: generic table shape not inferrable without a concrete schema
  table: AnyPgTable & { id: any; organizationId: any };
  idFrom: (c: Context) => string;
}

export const requireOrgOwnership = (resource: OwnershipResource) =>
  createMiddleware<{ Variables: OrgVariables }>(async (c, next) => {
    const orgId = c.get("orgId");
    if (!orgId)
      throw new HTTPException(500, {
        message: "requireOrgOwnership: orgId missing — chain requireOrg before requireOrgOwnership",
      });

    const id = resource.idFrom(c);
    const [row] = await db
      .select({ organizationId: resource.table.organizationId })
      // biome-ignore lint/suspicious/noExplicitAny: table type is validated at construction site
      .from(resource.table as any)
      .where(eq(resource.table.id, id));

    if (!row) throw new HTTPException(404, { message: "Not found" });
    if (row.organizationId !== orgId)
      throw new HTTPException(403, { message: "Cross-org access denied" });

    await next();
  });
