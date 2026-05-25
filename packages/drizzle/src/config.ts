import "dotenv/config";
import { drizzle, type NodePgTransaction } from "drizzle-orm/node-postgres";
import type { ExtractTablesWithRelations } from "drizzle-orm/relations";
import { Pool } from "pg";
import * as auditLogSchema from "./schema/audit-log";
import * as authSchema from "./schema/auth";
import * as multiTenantSchema from "./schema/multi-tenant";
import * as outboxSchema from "./schema/outbox";
import * as webhooksSchema from "./schema/webhooks";

const schema = {
  ...authSchema,
  ...multiTenantSchema,
  ...outboxSchema,
  ...auditLogSchema,
  ...webhooksSchema,
};

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

function getDb(): ReturnType<typeof drizzle<typeof schema>> {
  if (!_db) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is not set");
    }
    const pool = new Pool({
      connectionString,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
    _db = drizzle(pool, { schema });
  }
  return _db;
}

export const db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
  get(_target, prop) {
    return Reflect.get(getDb(), prop);
  },
});

export type DbClient = ReturnType<typeof drizzle<typeof schema>>;

export type Transaction = NodePgTransaction<
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;
