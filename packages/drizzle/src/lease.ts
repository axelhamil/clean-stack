import { eq, isNull, lte, type SQL, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

export interface LeaseColumns {
  id: AnyPgColumn;
  attempts: AnyPgColumn;
}

export interface LeaseKey {
  id: string;
  attempts: number;
}

export const dbNow: SQL = sql`now()`;

const DEAD_SHARE_OF_CLAIM = 4;

export function deadShareOf(limit: number): number {
  return Math.ceil(limit / DEAD_SHARE_OF_CLAIM);
}

export function isDue(nextAttemptAt: AnyPgColumn): SQL {
  return sql`(${isNull(nextAttemptAt)} or ${lte(nextAttemptAt, dbNow)})`;
}

export function isDeadDue(nextAttemptAt: AnyPgColumn): SQL {
  return lte(nextAttemptAt, dbNow);
}

export function secondsFromNow(seconds: number): SQL {
  return sql`now() + make_interval(secs => ${seconds})`;
}

export function leasedBy(columns: LeaseColumns, lease: LeaseKey): SQL {
  return sql`(${eq(columns.id, lease.id)} and ${eq(columns.attempts, lease.attempts)})`;
}

export function claimedSet(
  columns: Pick<LeaseColumns, "attempts">,
  leaseSeconds: number,
): { attempts: SQL; nextAttemptAt: SQL } {
  return {
    attempts: sql`${columns.attempts} + 1`,
    nextAttemptAt: secondsFromNow(leaseSeconds),
  };
}

export function releasedSet(columns: Pick<LeaseColumns, "attempts">): {
  attempts: SQL;
  nextAttemptAt: SQL;
} {
  return { attempts: sql`${columns.attempts} - 1`, nextAttemptAt: dbNow };
}
