import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as rateLimitSchema from "./schema/rate-limit";

const rlSchema = { ...rateLimitSchema };

export type RateLimitDbClient = ReturnType<typeof drizzle<typeof rlSchema>>;

let _rateLimitDb: RateLimitDbClient | null = null;

export function getRateLimitDbClient(): RateLimitDbClient {
  if (!_rateLimitDb) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is not set");
    }
    const pool = new Pool({
      connectionString,
      max: 3,
      connectionTimeoutMillis: 500,
      idleTimeoutMillis: 30000,
    });
    _rateLimitDb = drizzle(pool, { schema: rlSchema });
  }
  return _rateLimitDb;
}
