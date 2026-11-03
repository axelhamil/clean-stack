export type CoolifyEnvironment = "staging" | "production";

export const APP_ORDER = ["api", "app", "admin"] as const;

export type AppName = (typeof APP_ORDER)[number];

export type EnvSource =
  | { kind: "secret" }
  | { kind: "literal"; value: string }
  | { kind: "release" };

export interface ScheduledTask {
  name: string;
  command: string;
  schedule: string;
  timeoutSeconds: number;
  enabled: boolean;
}

export interface AppTask extends ScheduledTask {
  holdsDeploy: boolean;
}

export interface CoolifyApp {
  name: AppName;
  image: string;
  port: number;
  healthCheck: string;
  stopGraceSeconds: number;
  env: Record<string, EnvSource>;
  tasks: AppTask[];
}

const API_PORT = 3000;
const SPA_PORT = 80;
const cron = (job: string) => `bun apps/api/src/cron/${job}.ts`;

const API_SECRETS = [
  "DATABASE_URL",
  "BETTER_AUTH_URL",
  "BETTER_AUTH_SECRET",
  "APP_URL",
  "ADMIN_URL",
  "CORS_ORIGIN",
  "RESEND_API_KEY",
  "RESEND_FROM",
  "S3_ENDPOINT",
  "S3_BUCKET",
  "S3_ACCESS_KEY",
  "S3_SECRET_KEY",
  "S3_PUBLIC_URL",
  "INTERNAL_SIGNING_KEY",
  "WEBHOOK_MASTER_KEY",
  "API_TOKEN_PEPPER",
  "SCIM_CREDENTIAL_HASH_SECRET",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "SENTRY_DSN",
];

const secrets = (keys: readonly string[]): Record<string, EnvSource> =>
  Object.fromEntries(keys.map((key) => [key, { kind: "secret" }]));

const literal = (value: string): EnvSource => ({ kind: "literal", value });

const probe = (port: number, path: string) => `wget -qO- http://127.0.0.1:${port}${path}`;

function imageOf(owner: string, name: AppName): string {
  return `ghcr.io/${owner}/clean-stack-${name}`;
}

function apiEnv(environment: CoolifyEnvironment): Record<string, EnvSource> {
  return {
    ...secrets(API_SECRETS),
    NODE_ENV: literal("production"),
    PORT: literal(String(API_PORT)),
    API_URL: literal(`http://localhost:${API_PORT}`),
    INTERNAL_AUTH_LAYERS: literal("signature,private-network"),
    TRUSTED_PROXIES: literal("private"),
    RATE_LIMIT_STORE: literal("postgres"),
    S3_REGION: literal("auto"),
    S3_FORCE_PATH_STYLE: literal("false"),
    SENTRY_ENVIRONMENT: literal(environment),
    SHUTDOWN_DEADLINE_MS: literal("36000"),
    GIT_SHA: { kind: "release" },
  };
}

export function servicesFor(environment: CoolifyEnvironment, owner: string): CoolifyApp[] {
  return [
    {
      name: "api",
      image: imageOf(owner, "api"),
      port: API_PORT,
      healthCheck: probe(API_PORT, "/livez"),
      stopGraceSeconds: 45,
      env: apiEnv(environment),
      tasks: [
        {
          name: "rgpd-sweep",
          command: cron("rgpd-sweep"),
          schedule: "47 2 * * *",
          timeoutSeconds: 1_800,
          enabled: true,
          holdsDeploy: true,
        },
        {
          name: "sweep",
          command: cron("sweep"),
          schedule: "17 3 * * *",
          timeoutSeconds: 1_800,
          enabled: true,
          holdsDeploy: true,
        },
        {
          name: "flush-notification-emails",
          command: cron("flush-notification-emails"),
          schedule: "* * * * *",
          timeoutSeconds: 180,
          enabled: true,
          holdsDeploy: false,
        },
      ],
    },
    {
      name: "app",
      image: imageOf(owner, "app"),
      port: SPA_PORT,
      healthCheck: probe(SPA_PORT, "/health"),
      stopGraceSeconds: 10,
      env: secrets(["VITE_API_URL"]),
      tasks: [],
    },
    {
      name: "admin",
      image: imageOf(owner, "admin"),
      port: SPA_PORT,
      healthCheck: probe(SPA_PORT, "/health"),
      stopGraceSeconds: 10,
      env: secrets(["VITE_API_URL", "CSP_CONNECT_EXTRA"]),
      tasks: [],
    },
  ];
}

const DIGEST_REF = new RegExp(
  `^ghcr\\.io/([a-z0-9-]+)/clean-stack-(${APP_ORDER.join("|")})@sha256:[0-9a-f]{64}$`,
);

interface DigestRef {
  ref: string;
  owner: string;
  name: AppName;
}

export interface AppState {
  name: string;
  image: string;
  port: string;
  healthCheck: string;
  stopGraceSeconds: number;
  env: Record<string, string>;
  secrets: string[];
  tasks: ScheduledTask[];
}

export function isEnvironment(value: string | undefined): value is CoolifyEnvironment {
  return value === "staging" || value === "production";
}

function isAppName(value: string | undefined): value is AppName {
  return APP_ORDER.some((name) => name === value);
}

export function parseDigestRef(ref: string): DigestRef {
  const match = DIGEST_REF.exec(ref);
  const owner = match?.[1];
  const name = match?.[2];

  if (owner === undefined || !isAppName(name)) {
    throw new Error(
      `image reference ${ref} refused: ghcr.io/<owner>/clean-stack-<api|app|admin> pinned by its sha256 digest is required`,
    );
  }

  return { ref, owner, name };
}

export function findApp<T extends { uuid: string; name: string }>(
  apps: readonly T[],
  name: string,
  environment: string,
): T | undefined {
  const matching = apps.filter((app) => app.name === name);

  if (matching.length > 1) {
    throw new Error(
      `coolify has several applications named ${name} in ${environment} (${matching.map((app) => app.uuid).join(", ")}): keep one`,
    );
  }

  return matching[0];
}

export function stateOf(app: CoolifyApp): AppState {
  const env: Record<string, string> = {};
  const secrets: string[] = [];

  for (const [key, source] of Object.entries(app.env)) {
    if (source.kind === "literal") {
      env[key] = source.value;
    }

    if (source.kind === "secret") {
      secrets.push(key);
    }
  }

  return {
    name: app.name,
    image: app.image,
    port: String(app.port),
    healthCheck: app.healthCheck,
    stopGraceSeconds: app.stopGraceSeconds,
    env,
    secrets,
    tasks: app.tasks.map(({ holdsDeploy: _, ...task }) => task),
  };
}
