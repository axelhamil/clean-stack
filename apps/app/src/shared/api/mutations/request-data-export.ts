import { mutationOptions } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { getErrorsT } from "../../i18n/get-errors-t";
import { api } from "../api-client";
import { throwApiError } from "../errors/api-error";

const $request = api.me.export.$post;

type ExportResponse = InferResponseType<typeof $request, 200>;

export const requestDataExportMutationOptions = mutationOptions({
  mutationKey: ["export", "request"] as const,
  mutationFn: async (): Promise<ExportResponse> => {
    const res = await $request({});
    if (!res.ok)
      await throwApiError(
        res,
        getErrorsT()("fallback.requestDataExport", { defaultValue: "Export request failed" }),
      );
    return res.json();
  },
});
