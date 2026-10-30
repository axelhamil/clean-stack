import type { AuditedPage } from "@packages/test/a11y";
import type { Page } from "@playwright/test";

/**
 * The seeded user has already accepted every policy, so `/legal/accept` would
 * redirect away and fail the URL assertion. Serving stale statuses keeps the
 * page under audit without changing the database the other pages rely on.
 */
const STALE_POLICIES = {
  privacy: { current: false, acceptedVersion: null },
  terms: { current: false, acceptedVersion: null },
};

async function servePoliciesAsStale(page: Page): Promise<void> {
  await page.route("**/me/policies", (route) =>
    route.fulfill({
      json: STALE_POLICIES,
      headers: {
        "access-control-allow-origin": route.request().headers().origin ?? "*",
        "access-control-allow-credentials": "true",
      },
    }),
  );
}

export const PUBLIC_PAGES: readonly AuditedPage[] = [
  { name: "sign-in", path: "/sign-in" },
  { name: "sign-up", path: "/sign-up" },
  { name: "forgot password", path: "/forgot-password" },
  { name: "data rights", path: "/legal/data-rights" },
  { name: "accessibility statement", path: "/legal/accessibility" },
  { name: "privacy policy", path: "/legal/privacy-policy" },
  { name: "terms", path: "/legal/terms" },
  { name: "cookies policy", path: "/legal/cookies" },
  { name: "sub-processors", path: "/legal/sub-processors" },
  { name: "event catalog", path: "/developers/events" },
  { name: "pricing", path: "/pricing" },
];

/**
 * `/` is a pure redirect: auditing it audits whichever page it lands on, so the
 * signed-in destination is listed directly instead.
 */
export const AUTHENTICATED_PAGES: readonly AuditedPage[] = [
  { name: "dashboard", path: "/dashboard" },
  { name: "account settings", path: "/settings/account" },
  { name: "privacy settings", path: "/settings/privacy" },
  { name: "sso settings", path: "/settings/sso" },
  { name: "api tokens settings", path: "/settings/api-tokens" },
  { name: "notification settings", path: "/settings/notifications" },
  { name: "webhook settings", path: "/settings/webhooks" },
  { name: "organization settings", path: "/settings/organization" },
  { name: "billing settings", path: "/settings/billing" },
  { name: "new organization", path: "/org/new" },
  { name: "policy acceptance", path: "/legal/accept", prepare: servePoliciesAsStale },
];
