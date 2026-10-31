import { z } from "zod";
import type { StaffPermission } from "./staff";

const filterText = z.string().max(200).optional();

export const usersViewFiltersSchema = z.strictObject({
  q: filterText,
  status: z.enum(["active", "suspended"]).optional(),
  org: filterText,
});

export const orgsViewFiltersSchema = z.strictObject({ q: filterText });

export const auditViewFiltersSchema = z.strictObject({
  action: z.enum(["user.", "org.", "billing.", "security.", "webhook.", "admin."]).optional(),
  actor: filterText,
  org: filterText,
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
});

const viewName = z.string().trim().min(1).max(80);

export const staffViewSchema = z.discriminatedUnion("screen", [
  z.object({ screen: z.literal("users"), name: viewName, filters: usersViewFiltersSchema }),
  z.object({ screen: z.literal("orgs"), name: viewName, filters: orgsViewFiltersSchema }),
  z.object({ screen: z.literal("audit"), name: viewName, filters: auditViewFiltersSchema }),
]);

export type StaffView = z.infer<typeof staffViewSchema>;
export type StaffViewScreen = StaffView["screen"];

export const STAFF_VIEW_SCREEN_PERMISSION = {
  users: "users.read",
  orgs: "orgs.read",
  audit: "audit.read",
} as const satisfies Record<StaffViewScreen, StaffPermission>;

export const STAFF_VIEW_SCREENS = ["users", "orgs", "audit"] as const;

export function screensOpenTo(permissions: readonly StaffPermission[]): StaffViewScreen[] {
  return STAFF_VIEW_SCREENS.filter((screen) =>
    permissions.includes(STAFF_VIEW_SCREEN_PERMISSION[screen]),
  );
}
