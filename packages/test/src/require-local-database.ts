/**
 * Guard shared by every `check-*.ts` script that writes real rows through the real code
 * path against `DATABASE_URL`. These scripts are not safe to run against a shared database:
 * some take an ACCESS EXCLUSIVE lock, others insert rows a live worker could pick up and act
 * on (e.g. `EmailDeliveryWorker` polling `email_message` for `status = 'pending'`). Call this
 * before any seeding/mutation so a misconfigured `DATABASE_URL` fails fast instead of writing
 * to production.
 */

const POSTGRES_PROTOCOLS = new Set(["postgres:", "postgresql:"]);
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);

function isLocalDatabaseUrl(databaseUrl: string): boolean {
  const url = URL.parse(databaseUrl);
  if (!url) return false;

  return POSTGRES_PROTOCOLS.has(url.protocol) && LOCAL_HOSTS.has(url.hostname);
}

export function requireLocalDatabase(scriptName: string): void {
  const isLocalDatabase = isLocalDatabaseUrl(process.env.DATABASE_URL ?? "");
  if (!isLocalDatabase) {
    console.error(
      `${scriptName} refuses to run: DATABASE_URL does not point at localhost/127.0.0.1. ` +
        "This script writes real rows through the real code path, never point it at a shared database.",
    );
    process.exit(1);
  }
}
