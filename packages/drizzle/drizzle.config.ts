import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config();

// Use placeholder for static analysis tools (knip), actual value required at runtime
const databaseUrl = process.env.DATABASE_URL ?? "postgresql://placeholder";

export default defineConfig({
  schema: "./src/schema/*",
  out: "./migrations",
  dbCredentials: {
    url: databaseUrl,
  },
  verbose: true,
  strict: true,
  dialect: "postgresql",
});
