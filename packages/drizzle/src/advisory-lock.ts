import { sql } from "drizzle-orm";
import { resolveExecutor } from "./services/transaction-manager.service";

export async function lockForTransaction(key: string): Promise<void> {
  await resolveExecutor().execute(sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
}

export async function tryLockForTransaction(key: string): Promise<boolean> {
  const result = await resolveExecutor().execute<{ locked: boolean }>(
    sql`select pg_try_advisory_xact_lock(hashtextextended(${key}, 0)) as locked`,
  );
  return result.rows[0]?.locked === true;
}
