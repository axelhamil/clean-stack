import { throwApiError } from "@packages/web-kit/api/errors/api-error";
import { mutationOptions } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { api } from "../api-client";

const $request = api.me.export.$post;

type ExportResponse = InferResponseType<typeof $request, 200>;

export const requestDataExportMutationOptions = mutationOptions({
  mutationKey: ["export", "request"] as const,
  mutationFn: async (): Promise<ExportResponse> => {
    const res = await $request({});
    if (!res.ok) await throwApiError(res, "requestDataExport");
    return res.json();
  },
});
