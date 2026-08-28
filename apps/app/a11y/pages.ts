export interface AuditedPage {
  readonly name: string;
  readonly path: string;
}

export const PUBLIC_PAGES: readonly AuditedPage[] = [
  { name: "sign-in", path: "/sign-in" },
  { name: "sign-up", path: "/sign-up" },
  { name: "data rights", path: "/legal/data-rights" },
  { name: "accessibility statement", path: "/legal/accessibility" },
];

/**
 * `/` is a pure redirect — auditing it audits whichever page it lands on, so the
 * signed-in destination is listed directly instead.
 */
export const AUTHENTICATED_PAGES: readonly AuditedPage[] = [
  { name: "dashboard", path: "/dashboard" },
  { name: "account settings", path: "/settings/account" },
  { name: "privacy settings", path: "/settings/privacy" },
  { name: "sso settings", path: "/settings/sso" },
];
