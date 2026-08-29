import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { formatDate, formatDateTime } from "../utils";

/**
 * Formats a date in the active UI language.
 *
 * The locale is not a parameter the call site should be threading: passing
 * `i18n.language` by hand made components subscribe to `useTranslation` for a
 * value they never otherwise use, and a component that forgets renders dates in
 * a language the rest of its page does not speak. Binding the locale here keeps
 * the call site to the value it actually has.
 */
export function useFormatDate(): (value: Date | string) => string {
  const { i18n } = useTranslation();
  return useCallback((value: Date | string) => formatDate(value, i18n.language), [i18n.language]);
}

/** Date + time counterpart of `useFormatDate`. */
export function useFormatDateTime(): (value: Date | string) => string {
  const { i18n } = useTranslation();
  return useCallback(
    (value: Date | string) => formatDateTime(value, i18n.language),
    [i18n.language],
  );
}
