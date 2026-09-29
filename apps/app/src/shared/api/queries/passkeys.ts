import { queryOptions } from "@tanstack/react-query";
import { authClient } from "../../auth/auth-client";
import { getErrorsT } from "../../i18n/get-errors-t";
import { toAuthClientError } from "../errors/api-error";

export const passkeysQueryOptions = queryOptions({
  queryKey: ["passkeys"] as const,
  queryFn: async () => {
    const { data, error } = await authClient.passkey.listUserPasskeys();
    if (error) {
      throw toAuthClientError(
        error,
        getErrorsT()("fallback.loadPasskeys", { defaultValue: "Failed to load passkeys" }),
      );
    }

    return data ?? [];
  },
  staleTime: 30 * 1000,
});
