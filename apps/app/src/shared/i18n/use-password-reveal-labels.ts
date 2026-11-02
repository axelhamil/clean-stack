import { useTranslation } from "react-i18next";

/**
 * The accessible names of a password field's reveal toggle, spread onto every
 * `FormTextField type="password"` so each form does not look them up itself.
 */
export function usePasswordRevealLabels() {
  const { t } = useTranslation("common");

  return {
    showPasswordLabel: t("actions.showPassword"),
    hidePasswordLabel: t("actions.hidePassword"),
  };
}
