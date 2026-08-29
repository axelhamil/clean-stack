import type { Locale } from "@packages/i18n";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { setLocaleMutationOptions } from "../api/mutations/set-locale";
import { sessionQueryOptions } from "../api/queries/session";
import { markLocaleChosen } from "./locale-reconciliation";

export interface UseSetLocaleMutationOptions {
  onSaved?: (locale: Locale) => void | Promise<void>;
  onError?: (error: unknown) => void;
}

/**
 * Single entry point for writing the user's locale.
 *
 * Every caller must do the same two things on success — record the choice so
 * the session reconciliation stops treating a stale cached user row as the
 * truth, and invalidate the session query so the rest of the app stops reading
 * the old value — so they live here rather than being re-derived per call site.
 */
export function useSetLocaleMutation(options?: UseSetLocaleMutationOptions) {
  const queryClient = useQueryClient();

  return useMutation({
    ...setLocaleMutationOptions,
    onSuccess: async (_data, variables) => {
      markLocaleChosen(variables.locale);
      await options?.onSaved?.(variables.locale);
      await queryClient.invalidateQueries({ queryKey: sessionQueryOptions.queryKey });
    },
    onError: options?.onError,
  });
}
