import "dotenv/config";
import { drizzle, type NodePgTransaction } from "drizzle-orm/node-postgres";
import type { ExtractTablesWithRelations } from "drizzle-orm/relations";
import { Pool } from "pg";
import { requireDatabaseUrl } from "./database-url";
import * as auditLogSchema from "./schema/audit-log";
import * as authSchema from "./schema/auth";
import * as multiTenantSchema from "./schema/multi-tenant";
import * as outboxSchema from "./schema/outbox";
import * as ssoSchema from "./schema/sso";
import * as webhooksSchema from "./schema/webhooks";

const schema = {
  ...authSchema,
  ...multiTenantSchema,
  ...outboxSchema,
  ...auditLogSchema,
  ...webhooksSchema,
  ...ssoSchema,
};

export type DbClient = ReturnType<typeof drizzle<typeof schema>>;

export type Transaction = NodePgTransaction<
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

let _db: DbClient | null = null;

function getDb(): DbClient {
  if (_db) return _db;

  const pool = new Pool({
    connectionString: requireDatabaseUrl(),
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });
  _db = drizzle(pool, { schema });

  return _db;
}

export const db = new Proxy({} as DbClient, {
  get(_target, prop) {
    return Reflect.get(getDb(), prop);
  },
});
