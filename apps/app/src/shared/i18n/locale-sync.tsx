import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { sessionQueryOptions } from "../api/queries/session";
import { isImpersonating } from "../auth/is-impersonating";
import { changeLocale } from "./i18n";
import { getChosenLocale, reconcileLocale } from "./locale-reconciliation";
import { useSetLocaleMutation } from "./use-set-locale-mutation";

/**
 * Reconciles the browser-resolved locale with the one on the user record.
 *
 * The decision itself is `reconcileLocale` — this component only supplies the
 * inputs and runs the resulting effect.
 */
export function LocaleSync() {
  const { i18n } = useTranslation();
  const { data: session } = useQuery(sessionQueryOptions);
  const { mutate } = useSetLocaleMutation();
  const persisted = useRef(false);

  const userLocale = session?.user?.locale;
  const userId = session?.user?.id;
  const active = i18n.language;
  const impersonated = isImpersonating(session);

  useEffect(() => {
    if (!userId) return;

    const decision = reconcileLocale({
      userLocale,
      activeLocale: active,
      chosenLocale: getChosenLocale(),
      impersonated,
      alreadyPersisted: persisted.current,
    });

    if (decision.action === "apply") void changeLocale(i18n, decision.locale);
    if (decision.action === "persist") {
      persisted.current = true;
      mutate({ locale: decision.locale });
    }
  }, [userId, userLocale, active, i18n, mutate, impersonated]);

  return null;
}
