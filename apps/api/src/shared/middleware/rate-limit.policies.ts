import type { Context } from "hono";
import { getConnInfo } from "hono/bun";
import { env } from "../env";
import type { WindowConfig } from "../ports/rate-limiter.port";

export interface PolicyConfig {
  name: string;
  keyFn: (c: Context) => string;
  windows: WindowConfig[];
}

export function resolveClientIp(c: Context): string {
  const socketAddr = getConnInfo(c).remote.address ?? "";
  const trusted = env.TRUSTED_PROXIES;

  if (!trusted?.includes(socketAddr)) return socketAddr || "unknown";

  const xff = c.req.header("x-forwarded-for");
  if (!xff) return socketAddr || "unknown";

  // OWASP rightmost-non-trusted: walk XFF from right, skip trusted entries,
  // return the first non-trusted entry. This is the real client IP regardless
  // of how many trusted proxies are in the chain.
  const hops = xff.split(",").map((h) => h.trim());
  for (let i = hops.length - 1; i >= 0; i--) {
    const hop = hops[i];
    if (hop && !trusted.includes(hop)) return hop;
  }

  return socketAddr || "unknown";
}

function ipKeyFn(name: string): (c: Context) => string {
  return (c) => `${name}:${resolveClientIp(c)}`;
}

export const GLOBAL_POLICY: PolicyConfig = {
  name: "global",
  keyFn: (c) => {
    const user = c.get("user") as { id: string } | null | undefined;
    return `global:${user?.id ?? resolveClientIp(c)}`;
  },
  windows: [
    { policyName: "global", windowSec: 60, maxRequests: 60 },
    { policyName: "global", windowSec: 3600, maxRequests: 1800 },
  ],
};

export const AUTH_SIGN_IN_POLICY: PolicyConfig = {
  name: "auth-sign-in",
  keyFn: ipKeyFn("auth-sign-in"),
  windows: [{ policyName: "auth-sign-in", windowSec: 900, maxRequests: 5 }],
};

export const AUTH_FORGOT_PASSWORD_POLICY: PolicyConfig = {
  name: "auth-forgot-password",
  keyFn: ipKeyFn("auth-forgot-password"),
  windows: [{ policyName: "auth-forgot-password", windowSec: 900, maxRequests: 3 }],
};

export const AUTH_MAGIC_LINK_POLICY: PolicyConfig = {
  name: "auth-magic-link",
  keyFn: ipKeyFn("auth-magic-link"),
  windows: [{ policyName: "auth-magic-link", windowSec: 900, maxRequests: 3 }],
};

export const AUTH_SIGN_UP_POLICY: PolicyConfig = {
  name: "auth-sign-up",
  keyFn: ipKeyFn("auth-sign-up"),
  windows: [{ policyName: "auth-sign-up", windowSec: 3600, maxRequests: 10 }],
};
