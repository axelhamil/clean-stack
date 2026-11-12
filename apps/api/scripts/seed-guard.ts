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
