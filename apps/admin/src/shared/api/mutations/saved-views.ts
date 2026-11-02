import type { StaffView } from "@packages/access-control";
import { throwApiError } from "@packages/web-kit/api/errors/api-error";
import { mutationOptions } from "@tanstack/react-query";
import { api } from "../api-client";

const $save = api.admin.views.$post;
const $delete = api.admin.views[":id"].$delete;

export const saveViewMutationOptions = mutationOptions({
  mutationKey: ["admin", "views", "save"] as const,
  mutationFn: async (view: StaffView) => {
    const res = await $save({ json: view });
    if (!res.ok) await throwApiError(res, "saveView");
  },
});

export const deleteViewMutationOptions = mutationOptions({
  mutationKey: ["admin", "views", "delete"] as const,
  mutationFn: async (id: string) => {
    const res = await $delete({ param: { id } });
    if (!res.ok) await throwApiError(res, "deleteView");
  },
});
