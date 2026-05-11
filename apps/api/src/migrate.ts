import { db, migrate } from "@packages/drizzle";
import { logger } from "./shared/logger";

const migrationsFolder = process.env.MIGRATIONS_FOLDER ?? "./migrations";

logger.info({ migrationsFolder }, "running migrations");
await migrate(db, { migrationsFolder });
logger.info("migrations applied");
process.exit(0);
