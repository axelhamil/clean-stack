import { type SQL, sql } from "@packages/drizzle";

export interface PreferenceSide {
  locked: SQL;
  value: SQL;
}

export const preferencePrecedence = (org: PreferenceSide, user: SQL, fallback: SQL) =>
  sql`COALESCE(
    CASE WHEN ${org.locked} THEN ${org.value} END,
    ${user},
    ${org.value},
    ${fallback}
  )`;
