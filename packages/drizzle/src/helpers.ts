import { and, eq, type SQL } from "drizzle-orm";

export function withOrg<T extends { organizationId: any }>(
  table: T,
  orgId: string,
  extra?: SQL,
): SQL {
  const base = eq(table.organizationId, orgId);
  if (!extra) return base;
  const combined = and(base, extra);
  if (!combined) return base;
  return combined;
}
