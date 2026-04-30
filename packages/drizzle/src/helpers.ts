import { and, type Column, eq, type SQL } from "drizzle-orm";

export function withOrg<T extends { organizationId: Column }>(
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
