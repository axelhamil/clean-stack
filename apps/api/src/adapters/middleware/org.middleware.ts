import type { AnyPgTable } from "@packages/drizzle";
import { and, db, eq, schema } from "@packages/drizzle";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import type { SessionData, SessionUser } from "../../auth";

type OrgVariables = {
  user: SessionUser;
  session: SessionData;
  orgId: string;
  orgRole?: "owner" | "admin" | "member";
};

export const requireOrg = createMiddleware<{ Variables: OrgVariables }>(async (c, next) => {
  const session = c.get("session");
  if (!session?.activeOrganizationId) {
    throw new HTTPException(403, { message: "No active organization" });
  }
  c.set("orgId", session.activeOrganizationId);
  await next();
});

export const requireOrgRole = (allowed: ReadonlyArray<"owner" | "admin" | "member">) =>
  createMiddleware<{ Variables: OrgVariables }>(async (c, next) => {
    const orgId = c.get("orgId");
    const userId = c.get("user").id;
    const [row] = await db
      .select({ role: schema.member.role })
      .from(schema.member)
      .where(and(eq(schema.member.organizationId, orgId), eq(schema.member.userId, userId)));
    const role = row?.role as "owner" | "admin" | "member" | undefined;
    if (!role || !allowed.includes(role)) {
      throw new HTTPException(403, { message: "Insufficient role" });
    }
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
    const id = resource.idFrom(c);
    const [row] = await db
      .select({ organizationId: resource.table.organizationId })
      // biome-ignore lint/suspicious/noExplicitAny: table type is validated at construction site
      .from(resource.table as any)
      .where(eq(resource.table.id, id));
    if (!row) throw new HTTPException(404, { message: "Not found" });
    if (row.organizationId !== orgId) {
      throw new HTTPException(403, { message: "Cross-org access denied" });
    }
    await next();
  });
