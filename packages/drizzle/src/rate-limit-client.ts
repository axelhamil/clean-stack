import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { requireDatabaseUrl } from "./database-url";
import * as rateLimitSchema from "./schema/rate-limit";

const rlSchema = { ...rateLimitSchema };

export type RateLimitDbClient = ReturnType<typeof drizzle<typeof rlSchema>>;

let _rateLimitDb: RateLimitDbClient | null = null;
let _rateLimitPool: Pool | null = null;

export function getRateLimitDbClient(): RateLimitDbClient {
  if (_rateLimitDb) return _rateLimitDb;

  _rateLimitPool = new Pool({
    connectionString: requireDatabaseUrl(),
    max: 3,
    connectionTimeoutMillis: 500,
    idleTimeoutMillis: 30000,
  });
  _rateLimitDb = drizzle(_rateLimitPool, { schema: rlSchema });

  return _rateLimitDb;
}

export async function closeRateLimitDb(): Promise<void> {
  const pool = _rateLimitPool;
  if (!pool) return;

  _rateLimitPool = null;
  _rateLimitDb = null;
  await pool.end();
}
