import { isLocale } from "@packages/i18n";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { setLocaleMutationOptions } from "../api/mutations/set-locale";
import { sessionQueryOptions } from "../api/queries/session";
import { isImpersonating } from "../auth/is-impersonating";
import { changeLocale } from "./i18n";

/**
 * Reconciles the browser-resolved locale with the one on the user record.
 *
 * Server wins when it has a value. When it has none, the resolved locale is
 * persisted once — otherwise a user who never visits their settings keeps a
 * null locale forever and receives English emails while reading a French UI.
 */
export function LocaleSync() {
  const { i18n } = useTranslation();
  const { data: session } = useQuery(sessionQueryOptions);
  const { mutate } = useMutation(setLocaleMutationOptions);
  const persisted = useRef(false);

  const userLocale = session?.user?.locale;
  const userId = session?.user?.id;
  const active = i18n.language;
  const impersonated = isImpersonating(session);

  useEffect(() => {
    if (!userId) return;

    if (isLocale(userLocale)) {
      if (userLocale !== active) void changeLocale(i18n, userLocale);
      return;
    }

    if (impersonated) return;

    if (!persisted.current && isLocale(active)) {
      persisted.current = true;
      mutate({ locale: active });
    }
  }, [userId, userLocale, active, i18n, mutate, impersonated]);

  return null;
}
