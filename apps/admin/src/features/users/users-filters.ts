import { z } from "zod";
import type { UserQuery } from "../../shared/api/queries/users";

export const usersSearchSchema = z.object({
  q: z.string().optional().catch(undefined),
  status: z.enum(["active", "suspended"]).optional().catch(undefined),
  org: z.string().optional().catch(undefined),
});

export type UsersSearch = z.infer<typeof usersSearchSchema>;

export function userQueryOf(search: UsersSearch): UserQuery {
  const q = search.q?.trim();
  const org = search.org?.trim();

  return {
    ...(q ? { search: q } : {}),
    ...(org ? { organizationId: org } : {}),
    ...(search.status ? { banned: search.status === "suspended" ? "true" : "false" } : {}),
  };
}
