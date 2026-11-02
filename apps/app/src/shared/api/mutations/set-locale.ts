import type { Locale } from "@packages/i18n";
import { throwApiError } from "@packages/web-kit/api/errors/api-error";
import { mutationOptions } from "@tanstack/react-query";
import { api } from "../api-client";

export const setLocaleMutationOptions = mutationOptions({
  mutationKey: ["me", "locale"] as const,
  mutationFn: async ({ locale }: { locale: Locale }) => {
    const res = await api.me.locale.$put({ json: { locale } });
    if (!res.ok) await throwApiError(res, "setLocale");

    return res.json();
  },
});
