import type { z } from "zod";
import { memberRoleSchema } from "./organization.schema";

export type OrgRole = z.infer<typeof memberRoleSchema>;

export const ROLE_LABEL_KEYS = {
  owner: "common:roles.owner",
  admin: "common:roles.admin",
  member: "common:roles.member",
} as const satisfies Record<OrgRole, string>;

export function isOrgRole(value: string): value is OrgRole {
  return memberRoleSchema.safeParse(value).success;
}
