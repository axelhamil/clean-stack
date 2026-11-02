import type { StaffPermission } from "@packages/access-control";

const SECTIONS = [
  { id: "users", requires: "users.read" },
  { id: "orgs", requires: "orgs.read" },
  { id: "audit", requires: "audit.read" },
  { id: "operations", requires: "ops.read" },
  { id: "approvals", requires: "approvals.decide" },
  { id: "team", requires: "staff.manage" },
] as const satisfies readonly { id: string; requires: StaffPermission }[];

export type Section = (typeof SECTIONS)[number];

export function sectionsOpenTo(permissions: readonly StaffPermission[]): Section[] {
  return SECTIONS.filter((section) => permissions.includes(section.requires));
}

export function sectionOpenTo(
  id: string,
  permissions: readonly StaffPermission[],
): Section | undefined {
  return sectionsOpenTo(permissions).find((section) => section.id === id);
}

export function isSectionPath(pathname: string, id: Section["id"]): boolean {
  return pathname === `/${id}` || pathname.startsWith(`/${id}/`);
}
