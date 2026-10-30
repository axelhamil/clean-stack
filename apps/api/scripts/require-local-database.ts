/**
 * Guard shared by every `check-*.ts` script that writes real rows through the real code
 * path against `DATABASE_URL`. These scripts are not safe to run against a shared database:
 * some take an ACCESS EXCLUSIVE lock, others insert rows a live worker could pick up and act
 * on (e.g. `EmailDeliveryWorker` polling `email_message` for `status = 'pending'`). Call this
 * before any seeding/mutation so a misconfigured `DATABASE_URL` fails fast instead of writing
 * to production.
 */

const LOCAL_DATABASE_URL_PATTERN =
  /^(?:postgres(?:ql)?:\/\/)[^/]*@?(localhost|127\.0\.0\.1)(?::\d+)?\//;

export function requireLocalDatabase(scriptName: string): void {
  const databaseUrl = process.env.DATABASE_URL ?? "";
  const isLocalDatabase = LOCAL_DATABASE_URL_PATTERN.test(databaseUrl);
  if (!isLocalDatabase) {
    console.error(
      `${scriptName} refuses to run: DATABASE_URL does not point at localhost/127.0.0.1. ` +
        "This script writes real rows through the real code path, never point it at a shared database.",
    );
    process.exit(1);
  }
}

const SEEDABLE_HOSTS = new Set(["localhost", "127.0.0.1", "postgres"]);

function hostOf(databaseUrl: string | undefined): string | undefined {
  return URL.parse(databaseUrl ?? "")?.hostname;
}

export function requireSeedableDatabase(databaseUrl: string | undefined): void {
  if (SEEDABLE_HOSTS.has(hostOf(databaseUrl) ?? "")) return;

  throw new Error(
    "Refusing to seed staff: these accounts include a manager with a public TOTP secret, so DATABASE_URL must point at localhost, 127.0.0.1 or postgres.",
  );
}
