import { queryOptions } from "@tanstack/react-query";
import { authClient } from "../../auth/auth-client";

export const passkeysQueryOptions = queryOptions({
  queryKey: ["passkeys"] as const,
  queryFn: async () => {
    const { data, error } = await authClient.passkey.listUserPasskeys();
    if (error) throw new Error(error.message ?? "Failed to load passkeys");

    return data ?? [];
  },
  staleTime: 30 * 1000,
});
