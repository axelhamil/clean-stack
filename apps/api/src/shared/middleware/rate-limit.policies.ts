import type { Context } from "hono";
import type { WindowConfig } from "../ports/rate-limiter.port";
import { resolveClientIp } from "./rate-limit.ip";

export interface PolicyConfig {
  name: string;
  keyFn: (c: Context) => string;
  windows: WindowConfig[];
  emitSecurityEvent?: boolean;
  advertiseBudget?: boolean;
  // Deny (503) instead of allowing through when the limiter store itself errors.
  // Set on auth/abuse-sensitive policies: a store outage must not silently disable
  // brute-force protection (OWASP A10:2025 / CWE-636). GLOBAL/CSP stay fail-open.
  failClosed?: boolean;
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
  emitSecurityEvent: true,
  failClosed: true,
};

export const AUTH_FORGOT_PASSWORD_POLICY: PolicyConfig = {
  name: "auth-forgot-password",
  keyFn: ipKeyFn("auth-forgot-password"),
  windows: [{ policyName: "auth-forgot-password", windowSec: 900, maxRequests: 3 }],
  emitSecurityEvent: true,
  failClosed: true,
};

export const AUTH_MAGIC_LINK_POLICY: PolicyConfig = {
  name: "auth-magic-link",
  keyFn: ipKeyFn("auth-magic-link"),
  windows: [{ policyName: "auth-magic-link", windowSec: 900, maxRequests: 3 }],
  emitSecurityEvent: true,
  failClosed: true,
};

export const AUTH_SIGN_UP_POLICY: PolicyConfig = {
  name: "auth-sign-up",
  keyFn: ipKeyFn("auth-sign-up"),
  windows: [{ policyName: "auth-sign-up", windowSec: 3600, maxRequests: 10 }],
  emitSecurityEvent: true,
  failClosed: true,
};

// Two-factor verify paths: /two-factor/verify-totp, /two-factor/verify-otp,
// /two-factor/verify-backup-code (BetterAuth twoFactor plugin, confirmed via dist grep).
export const AUTH_TWO_FACTOR_POLICY: PolicyConfig = {
  name: "auth-two-factor",
  keyFn: ipKeyFn("auth-two-factor"),
  windows: [{ policyName: "auth-two-factor", windowSec: 900, maxRequests: 5 }],
  emitSecurityEvent: true,
  failClosed: true,
  advertiseBudget: false,
};

// /verify-email: GET with ?token= (token consumption path).
export const AUTH_VERIFY_EMAIL_POLICY: PolicyConfig = {
  name: "auth-verify-email",
  keyFn: (c) => {
    const token = c.req.query("token");
    return `auth-verify-email:${token ?? resolveClientIp(c)}`;
  },
  windows: [{ policyName: "auth-verify-email", windowSec: 900, maxRequests: 5 }],
  emitSecurityEvent: true,
  failClosed: true,
  advertiseBudget: false,
};

// /reset-password: POST that consumes the reset token (distinct from /request-password-reset).
export const AUTH_RESET_PASSWORD_POLICY: PolicyConfig = {
  name: "auth-reset-password",
  keyFn: ipKeyFn("auth-reset-password"),
  windows: [{ policyName: "auth-reset-password", windowSec: 900, maxRequests: 3 }],
  emitSecurityEvent: true,
  failClosed: true,
  advertiseBudget: false,
};

// /passkey/generate-authenticate-options + /passkey/verify-authentication
// (BetterAuth @better-auth/passkey plugin, confirmed via dist grep).
export const AUTH_PASSKEY_POLICY: PolicyConfig = {
  name: "auth-passkey",
  keyFn: ipKeyFn("auth-passkey"),
  windows: [{ policyName: "auth-passkey", windowSec: 900, maxRequests: 10 }],
  emitSecurityEvent: true,
  failClosed: true,
  advertiseBudget: false,
};

// Cookie consent POST — public guest endpoint, keyed by IP.
// fail-open: a store outage must not block consent recording (guest flow).
// emitSecurityEvent=false: consent spam is not a security signal.
// advertiseBudget=false: no RateLimit headers on consent routes.
export const CONSENT_POST_POLICY: PolicyConfig = {
  name: "consent-post",
  keyFn: ipKeyFn("consent-post"),
  windows: [
    { policyName: "consent-post", windowSec: 60, maxRequests: 10 },
    { policyName: "consent-post", windowSec: 3600, maxRequests: 50 },
  ],
  emitSecurityEvent: false,
  advertiseBudget: false,
};

// Browser-sent CSP violation reports — no user identity, keyed by IP.
// emitSecurityEvent=false: the violation itself is the signal (emitted unconditionally per report).
// advertiseBudget=false: no RateLimit headers exposed to browsers.
export const CSP_REPORT_POLICY: PolicyConfig = {
  name: "csp-report",
  keyFn: ipKeyFn("csp-report"),
  windows: [
    { policyName: "csp-report", windowSec: 60, maxRequests: 20 },
    { policyName: "csp-report", windowSec: 3600, maxRequests: 200 },
  ],
  emitSecurityEvent: false,
  advertiseBudget: false,
};
