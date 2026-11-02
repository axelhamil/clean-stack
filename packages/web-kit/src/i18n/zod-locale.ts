import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { applyZodErrorMap } from "./zod-error-map";

export function ZodLocale() {
  const { t } = useTranslation("errors");

  useEffect(() => {
    applyZodErrorMap(t);
  }, [t]);

  return null;
}
