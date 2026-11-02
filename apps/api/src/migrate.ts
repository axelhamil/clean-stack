import { db, migrate } from "@packages/drizzle";
import { env } from "./shared/env";
import { logger } from "./shared/logger";

const migrationsFolder = env.MIGRATIONS_FOLDER;

logger.info({ migrationsFolder }, "running migrations");
await migrate(db, { migrationsFolder });
logger.info("migrations applied");
process.exit(0);
