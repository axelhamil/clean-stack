import type { StaffRole } from "@packages/access-control";
import { throwApiError } from "@packages/web-kit/api/errors/api-error";
import { queryOptions } from "@tanstack/react-query";
import { api } from "../../../shared/api/api-client";

export interface StaffMember {
  userId: string;
  email: string;
  name: string;
  role: StaffRole;
  source: "env" | "console" | "migration";
  createdAt: string;
}

const $list = api.admin.staff.$get;
const $overrides = api.admin.staff[":id"].overrides.$get;

export const staffQueryOptions = queryOptions({
  queryKey: ["admin", "staff", "list"] as const,
  queryFn: async ({ signal }): Promise<{ items: StaffMember[] }> => {
    const res = await $list({}, { init: { signal } });
    if (!res.ok) await throwApiError(res, "loadStaff");

    return res.json();
  },
});

export const staffOverridesQueryOptions = (id: string) =>
  queryOptions({
    queryKey: ["admin", "staff", "overrides", id] as const,
    queryFn: async ({ signal }) => {
      const res = await $overrides({ param: { id } }, { init: { signal } });
      if (!res.ok) await throwApiError(res, "loadStaffOverrides");

      return res.json();
    },
  });
