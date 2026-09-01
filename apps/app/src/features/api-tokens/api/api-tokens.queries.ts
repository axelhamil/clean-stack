import { queryOptions } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { api } from "../../../shared/api/api-client";
import { throwApiError } from "../../../shared/api/errors/api-error";
import { getErrorsT } from "../../../shared/i18n/get-errors-t";

const $list = api.settings.tokens.$get;

export type ApiTokensResponse = InferResponseType<typeof $list, 200>;
export type ApiToken = ApiTokensResponse["items"][number];

// `null` is a real scope, not a missing value: with no active organization the
// endpoint returns the caller's personal (org-less) tokens.
export const apiTokensQueryOptions = (organizationId: string | null) =>
  queryOptions({
    queryKey: ["settings", "api-tokens", organizationId] as const,
    queryFn: async ({ signal }) => {
      const res = await $list({}, { init: { signal } });
      if (!res.ok)
        await throwApiError(
          res,
          getErrorsT()("fallback.loadApiTokens", { defaultValue: "Failed to load API tokens" }),
        );
      return (await res.json()) as ApiTokensResponse;
    },
  });
