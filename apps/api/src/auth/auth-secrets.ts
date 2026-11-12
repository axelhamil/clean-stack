import type { SecretConfig } from "better-auth/crypto";

export interface VersionedAuthSecret {
  version: number;
  value: string;
}

interface AuthSecretSource {
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_SECRETS?: VersionedAuthSecret[];
}

export function authSecretKey(source: AuthSecretSource): string | SecretConfig {
  const secrets = source.BETTER_AUTH_SECRETS;
  const current = secrets?.[0];
  if (!secrets || !current) return source.BETTER_AUTH_SECRET;

  return {
    keys: new Map(secrets.map((s) => [s.version, s.value])),
    currentVersion: current.version,
    legacySecret: source.BETTER_AUTH_SECRET,
  };
}
