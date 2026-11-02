import { usersViewFiltersSchema } from "@packages/access-control";
import { z } from "zod";
import type { UserQuery } from "../../shared/api/queries/users";

export const usersSearchSchema = z.object({
  q: usersViewFiltersSchema.shape.q.catch(undefined),
  status: usersViewFiltersSchema.shape.status.catch(undefined),
  org: usersViewFiltersSchema.shape.org.catch(undefined),
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
