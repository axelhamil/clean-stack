import { z } from "zod";
import type { StaffPermission } from "./staff";

const STAFF_VIEW_SCREENS = ["users", "orgs", "audit"] as const;

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

const VIEW_NAME_MAX = 80;
const viewName = z.string().trim().min(1).max(VIEW_NAME_MAX);

export const staffViewSchema = z.discriminatedUnion("screen", [
  z.object({ screen: z.literal("users"), name: viewName, filters: usersViewFiltersSchema }),
  z.object({ screen: z.literal("orgs"), name: viewName, filters: orgsViewFiltersSchema }),
  z.object({ screen: z.literal("audit"), name: viewName, filters: auditViewFiltersSchema }),
]);

export type StaffView = z.infer<typeof staffViewSchema>;
export type StaffViewScreen = StaffView["screen"];

const FILTER_FIELDS: Record<StaffViewScreen, Record<string, z.ZodType>> = {
  users: usersViewFiltersSchema.shape,
  orgs: orgsViewFiltersSchema.shape,
  audit: auditViewFiltersSchema.shape,
};

const storedFilters = z.record(z.string(), z.unknown());

export function storedStaffView(stored: {
  screen: string;
  name: string;
  filters: unknown;
}): StaffView | undefined {
  const screen = STAFF_VIEW_SCREENS.find((candidate) => candidate === stored.screen);
  if (!screen) return undefined;

  const fields = FILTER_FIELDS[screen];
  const raw = storedFilters.safeParse(stored.filters).data ?? {};
  const filters = Object.fromEntries(
    Object.entries(raw).filter(([field, value]) => fields[field]?.safeParse(value).success),
  );
  const parsed = staffViewSchema.safeParse({
    screen,
    name: stored.name.trim().slice(0, VIEW_NAME_MAX),
    filters,
  });

  return parsed.data;
}

export const STAFF_VIEW_SCREEN_PERMISSION = {
  users: "users.read",
  orgs: "orgs.read",
  audit: "audit.read",
} as const satisfies Record<StaffViewScreen, StaffPermission>;

export function screensOpenTo(permissions: readonly StaffPermission[]): StaffViewScreen[] {
  return STAFF_VIEW_SCREENS.filter((screen) =>
    permissions.includes(STAFF_VIEW_SCREEN_PERMISSION[screen]),
  );
}
