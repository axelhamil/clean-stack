import { isIP } from "node:net";
import { getPublicSuffix } from "tldts";
import type { z } from "zod";
import {
  DEADLINE_FLUSH_TIMEOUT_MS,
  GRACE_MARGIN_MS,
  TELEMETRY_FLUSH_MARGIN_MS,
  TELEMETRY_FLUSH_TIMEOUT_MS,
  worstCaseShutdownMs,
} from "./shutdown";

export const OUTBOX_SETTLE_MARGIN_SECONDS = 10;
export const EMAIL_SEND_TIMEOUT_SECONDS = 30;
export const EMAIL_SETTLE_MARGIN_SECONDS = 15;
export const WEBHOOK_DNS_TIMEOUT_SECONDS = 5;
export const WEBHOOK_FETCH_TIMEOUT_SECONDS = 30;
export const WEBHOOK_SETTLE_MARGIN_SECONDS = 30;

/**
 * The sweep-timeout bounds only work nested: the sweep must be able to finish and
 * answer before the socket closes, and the socket must close before the client gives
 * up. The shutdown bounds only work when the deadline covers the worst case of every
 * step plus the margins the shutdown adds. A `.env` that breaks either silently
 * reproduces the bug its configuration exists to prevent, so it fails the boot instead.
 *
 * Kept out of `env.ts` so tests can exercise the comparisons against plain literals:
 * `env.ts` parses `process.env` at import time and throws on missing required vars,
 * so anything imported from it would require a full `.env`.
 */
export function validateEnvBounds(
  value: {
    SERVER_IDLE_TIMEOUT_SECONDS: number;
    SWEEP_DEADLINE_MS: number;
    INTERNAL_FETCH_TIMEOUT_MS: number;
    SHUTDOWN_GRACE_PERIOD_MS: number;
    SHUTDOWN_STEP_TIMEOUT_MS: number;
    SHUTDOWN_WORKERS_TIMEOUT_MS: number;
    SHUTDOWN_DEADLINE_MS: number;
    OUTBOX_LEASE_SECONDS: number;
    OUTBOX_HANDLER_BUDGET_SECONDS: number;
    EMAIL_LEASE_SECONDS: number;
    EMAIL_DEAD_RETRY_HOURS: number;
    EMAIL_DEAD_REPLAY_WINDOW_HOURS: number;
    WEBHOOK_LEASE_SECONDS: number;
  },
  ctx: z.RefinementCtx,
): void {
  const idleMs = value.SERVER_IDLE_TIMEOUT_SECONDS * 1000;
  if (value.SWEEP_DEADLINE_MS >= idleMs) {
    ctx.addIssue({
      code: "custom",
      path: ["SWEEP_DEADLINE_MS"],
      message: `SWEEP_DEADLINE_MS (${value.SWEEP_DEADLINE_MS}) must be below SERVER_IDLE_TIMEOUT_SECONDS (${value.SERVER_IDLE_TIMEOUT_SECONDS}s = ${idleMs}ms), or the socket closes before the sweep can answer.`,
    });
  }
  if (value.INTERNAL_FETCH_TIMEOUT_MS <= idleMs) {
    ctx.addIssue({
      code: "custom",
      path: ["INTERNAL_FETCH_TIMEOUT_MS"],
      message: `INTERNAL_FETCH_TIMEOUT_MS (${value.INTERNAL_FETCH_TIMEOUT_MS}) must exceed SERVER_IDLE_TIMEOUT_SECONDS (${value.SERVER_IDLE_TIMEOUT_SECONDS}s = ${idleMs}ms), or the client gives up before the server answers.`,
    });
  }

  const shutdownBudgetMs = worstCaseShutdownMs({
    graceMs: value.SHUTDOWN_GRACE_PERIOD_MS,
    stepMs: value.SHUTDOWN_STEP_TIMEOUT_MS,
    workersMs: value.SHUTDOWN_WORKERS_TIMEOUT_MS,
  });
  if (shutdownBudgetMs > value.SHUTDOWN_DEADLINE_MS) {
    ctx.addIssue({
      code: "custom",
      path: ["SHUTDOWN_DEADLINE_MS"],
      message: `SHUTDOWN_DEADLINE_MS (${value.SHUTDOWN_DEADLINE_MS}) must cover the worst-case shutdown (${shutdownBudgetMs}ms): SHUTDOWN_GRACE_PERIOD_MS + ${GRACE_MARGIN_MS}, 2 x SHUTDOWN_STEP_TIMEOUT_MS (http, database pool), SHUTDOWN_WORKERS_TIMEOUT_MS, the ${TELEMETRY_FLUSH_TIMEOUT_MS + TELEMETRY_FLUSH_MARGIN_MS}ms telemetry flush and the ${DEADLINE_FLUSH_TIMEOUT_MS}ms deadline flush, or a slow but healthy shutdown is cut by the deadline and exits 1.`,
    });
  }

  const leaseFloor = value.OUTBOX_HANDLER_BUDGET_SECONDS + OUTBOX_SETTLE_MARGIN_SECONDS;
  if (value.OUTBOX_LEASE_SECONDS < leaseFloor) {
    ctx.addIssue({
      code: "custom",
      path: ["OUTBOX_LEASE_SECONDS"],
      message: `OUTBOX_LEASE_SECONDS (${value.OUTBOX_LEASE_SECONDS}) must be at least OUTBOX_HANDLER_BUDGET_SECONDS (${value.OUTBOX_HANDLER_BUDGET_SECONDS}) + the ${OUTBOX_SETTLE_MARGIN_SECONDS}s claim and settle margin (${leaseFloor}), or a handler still within its budget outlives the lease and another relay claims the same event.`,
    });
  }

  const emailLeaseFloor = EMAIL_SEND_TIMEOUT_SECONDS + EMAIL_SETTLE_MARGIN_SECONDS;
  if (value.EMAIL_LEASE_SECONDS < emailLeaseFloor) {
    ctx.addIssue({
      code: "custom",
      path: ["EMAIL_LEASE_SECONDS"],
      message: `EMAIL_LEASE_SECONDS (${value.EMAIL_LEASE_SECONDS}) must be at least the ${EMAIL_SEND_TIMEOUT_SECONDS}s send timeout + the ${EMAIL_SETTLE_MARGIN_SECONDS}s claim and settle margin (${emailLeaseFloor}), or a batch still waiting on the provider outlives the lease and another worker sends the same emails again.`,
    });
  }

  if (value.EMAIL_DEAD_REPLAY_WINDOW_HOURS <= value.EMAIL_DEAD_RETRY_HOURS) {
    ctx.addIssue({
      code: "custom",
      path: ["EMAIL_DEAD_REPLAY_WINDOW_HOURS"],
      message: `EMAIL_DEAD_REPLAY_WINDOW_HOURS (${value.EMAIL_DEAD_REPLAY_WINDOW_HOURS}) must exceed EMAIL_DEAD_RETRY_HOURS (${value.EMAIL_DEAD_RETRY_HOURS}), or a dead email leaves its replay window before its first replay is due and is never retried.`,
    });
  }

  const webhookLeaseFloor =
    WEBHOOK_DNS_TIMEOUT_SECONDS + WEBHOOK_FETCH_TIMEOUT_SECONDS + WEBHOOK_SETTLE_MARGIN_SECONDS;
  if (value.WEBHOOK_LEASE_SECONDS < webhookLeaseFloor) {
    ctx.addIssue({
      code: "custom",
      path: ["WEBHOOK_LEASE_SECONDS"],
      message: `WEBHOOK_LEASE_SECONDS (${value.WEBHOOK_LEASE_SECONDS}) must be at least the ${WEBHOOK_DNS_TIMEOUT_SECONDS}s lookup timeout + the ${WEBHOOK_FETCH_TIMEOUT_SECONDS}s delivery timeout + the ${WEBHOOK_SETTLE_MARGIN_SECONDS}s claim and settle margin (${webhookLeaseFloor}), or a delivery still waiting on its endpoint outlives the lease and another worker sends it again.`,
    });
  }
}

export function validateApprovalEnv(
  value: { ADMIN_APPROVAL_ENABLED: boolean; ADMIN_APPROVAL_ACTIONS: readonly string[] },
  ctx: z.RefinementCtx,
): void {
  if (!value.ADMIN_APPROVAL_ENABLED) return;

  const gatesRoleOnly =
    value.ADMIN_APPROVAL_ACTIONS.includes("staff.role_change") &&
    !value.ADMIN_APPROVAL_ACTIONS.includes("staff.permission_override");
  if (gatesRoleOnly) {
    ctx.addIssue({
      code: "custom",
      path: ["ADMIN_APPROVAL_ACTIONS"],
      message:
        "ADMIN_APPROVAL_ACTIONS lists staff.role_change without staff.permission_override: a single person could grant through an override what the role change gates. Add staff.permission_override.",
    });
  }

  if (value.ADMIN_APPROVAL_ACTIONS.length > 0) return;

  ctx.addIssue({
    code: "custom",
    path: ["ADMIN_APPROVAL_ACTIONS"],
    message:
      "ADMIN_APPROVAL_ACTIONS is empty while ADMIN_APPROVAL_ENABLED is true: four-eyes would look on and gate nothing.",
  });
}

const HTTP_TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
const DENY_COUNTRY = /^[A-Z][A-Z0-9]$/;
const DENY_ASN = /^\d{1,10}$/;

function isTrustedProxyEntry(entry: string): boolean {
  if (entry === "private" || isIP(entry) !== 0) return true;

  const [address = "", prefix = "", ...rest] = entry.split("/");
  if (rest.length > 0 || !/^\d{1,3}$/.test(prefix)) return false;

  const family = isIP(address);
  if (family === 4) return Number(prefix) <= 32;

  return family === 6 && Number(prefix) <= 128;
}

export function validateSecuritySignalsEnv(
  value: {
    TRUSTED_PROXIES?: string[];
    GEO_COUNTRY_HEADER?: string;
    GEO_ASN_HEADER?: string;
    IMPOSSIBLE_TRAVEL_WINDOW_MINUTES?: number;
    SECURITY_DENY_COUNTRIES: string[];
    SECURITY_DENY_ASNS: string[];
  },
  ctx: z.RefinementCtx,
): void {
  const refuse = (path: string, message: string) =>
    ctx.addIssue({ code: "custom", path: [path], message });

  const badProxies = value.TRUSTED_PROXIES?.filter((entry) => !isTrustedProxyEntry(entry)) ?? [];
  if (badProxies.length > 0) {
    refuse(
      "TRUSTED_PROXIES",
      `TRUSTED_PROXIES has entries that are not \`private\`, an IP or a CIDR: ${badProxies.join(", ")}. They would silently trust nothing.`,
    );
  }
  const refuseBadHeader = (name: string, header: string | undefined) => {
    if (header === undefined || HTTP_TOKEN.test(header)) return;

    refuse(name, `${name} is not a valid HTTP header name, it would never match a request.`);
  };
  refuseBadHeader("GEO_COUNTRY_HEADER", value.GEO_COUNTRY_HEADER);
  refuseBadHeader("GEO_ASN_HEADER", value.GEO_ASN_HEADER);
  const badCountries = value.SECURITY_DENY_COUNTRIES.filter((c) => !DENY_COUNTRY.test(c));
  if (badCountries.length > 0) {
    refuse(
      "SECURITY_DENY_COUNTRIES",
      `SECURITY_DENY_COUNTRIES takes two-letter country codes, these never match: ${badCountries.join(", ")}.`,
    );
  }
  const badAsns = value.SECURITY_DENY_ASNS.filter((asn) => !DENY_ASN.test(asn));
  if (badAsns.length > 0) {
    refuse(
      "SECURITY_DENY_ASNS",
      `SECURITY_DENY_ASNS takes AS numbers such as AS64496, these never match: ${badAsns.join(", ")}.`,
    );
  }

  if ((value.GEO_COUNTRY_HEADER || value.GEO_ASN_HEADER) && !value.TRUSTED_PROXIES?.length) {
    ctx.addIssue({
      code: "custom",
      path: ["TRUSTED_PROXIES"],
      message:
        "GEO_COUNTRY_HEADER and GEO_ASN_HEADER are only read from a trusted proxy: set TRUSTED_PROXIES, or the header is never trusted.",
    });
  }
  if (value.IMPOSSIBLE_TRAVEL_WINDOW_MINUTES !== undefined && !value.GEO_COUNTRY_HEADER) {
    ctx.addIssue({
      code: "custom",
      path: ["IMPOSSIBLE_TRAVEL_WINDOW_MINUTES"],
      message: "IMPOSSIBLE_TRAVEL_WINDOW_MINUTES needs GEO_COUNTRY_HEADER to know any country.",
    });
  }
  if (value.SECURITY_DENY_COUNTRIES.length > 0 && !value.GEO_COUNTRY_HEADER) {
    ctx.addIssue({
      code: "custom",
      path: ["SECURITY_DENY_COUNTRIES"],
      message: "SECURITY_DENY_COUNTRIES needs GEO_COUNTRY_HEADER, or nothing is ever denied.",
    });
  }
  if (value.SECURITY_DENY_ASNS.length > 0 && !value.GEO_ASN_HEADER) {
    ctx.addIssue({
      code: "custom",
      path: ["SECURITY_DENY_ASNS"],
      message: "SECURITY_DENY_ASNS needs GEO_ASN_HEADER, or nothing is ever denied.",
    });
  }
}

const COOKIE_DOMAIN = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;

function hostOf(url: string): string {
  return new URL(url).hostname;
}

function coversHost(domain: string, host: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

/**
 * Both values fail quietly in a browser: an admin URL with a path never equals an `Origin`
 * header, and a cookie domain that is not a parent of every host is dropped, which signs
 * everyone out with no error anywhere. Refusing the boot is the only signal that gets read.
 */
export function validateHostsEnv(
  value: {
    NODE_ENV: string;
    ADMIN_URL?: string;
    APP_URL: string;
    BETTER_AUTH_URL: string;
    AUTH_COOKIE_DOMAIN?: string;
  },
  ctx: z.RefinementCtx,
): void {
  const { ADMIN_URL: adminUrl, AUTH_COOKIE_DOMAIN: cookieDomain } = value;

  if (adminUrl && new URL(adminUrl).origin !== adminUrl) {
    ctx.addIssue({
      code: "custom",
      path: ["ADMIN_URL"],
      message: `ADMIN_URL (${adminUrl}) must be an origin: scheme and host, no path and no trailing slash, or it never matches a browser Origin header.`,
    });
  }
  if (adminUrl && value.NODE_ENV === "production" && !adminUrl.startsWith("https://")) {
    ctx.addIssue({
      code: "custom",
      path: ["ADMIN_URL"],
      message: "ADMIN_URL must use https in production: session cookies are Secure there.",
    });
  }
  if (!cookieDomain) return;

  if (!COOKIE_DOMAIN.test(cookieDomain)) {
    ctx.addIssue({
      code: "custom",
      path: ["AUTH_COOKIE_DOMAIN"],
      message: `AUTH_COOKIE_DOMAIN (${cookieDomain}) must be a bare lowercase parent domain, e.g. example.com.`,
    });
    return;
  }

  if (getPublicSuffix(cookieDomain, { allowPrivateDomains: true }) === cookieDomain) {
    ctx.addIssue({
      code: "custom",
      path: ["AUTH_COOKIE_DOMAIN"],
      message: `AUTH_COOKIE_DOMAIN (${cookieDomain}) is a public suffix: browsers reject the cookie, which signs everyone out. Use a domain you own, or leave it empty.`,
    });
    return;
  }

  const hosts = [value.APP_URL, value.BETTER_AUTH_URL, ...(adminUrl ? [adminUrl] : [])].map(hostOf);
  const outside = hosts.filter((host) => !coversHost(cookieDomain, host));
  if (outside.length === 0) return;

  ctx.addIssue({
    code: "custom",
    path: ["AUTH_COOKIE_DOMAIN"],
    message: `AUTH_COOKIE_DOMAIN (${cookieDomain}) is not a parent of ${outside.join(", ")}: the browser would drop the session cookie and lock staff out.`,
  });
}

export function frontOrigins(value: { CORS_ORIGIN?: string[]; ADMIN_URL?: string }): string[] {
  const origins = value.CORS_ORIGIN ?? ["http://localhost:5173"];

  return value.ADMIN_URL ? [...new Set([...origins, value.ADMIN_URL])] : origins;
}
