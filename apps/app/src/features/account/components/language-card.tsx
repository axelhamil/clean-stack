import { isLocale, LOCALES, type Locale } from "@packages/i18n";
import { Button } from "@packages/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@packages/ui/components/ui/card";
import { Label } from "@packages/ui/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@packages/ui/components/ui/select";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { toastError } from "../../../shared/api/errors/toast";
import { setLocaleMutationOptions } from "../../../shared/api/mutations/set-locale";
import { sessionQueryOptions } from "../../../shared/api/queries/session";
import { isImpersonating } from "../../../shared/auth/is-impersonating";
import { changeLocale } from "../../../shared/i18n/i18n";

export function LanguageCard() {
  const { t, i18n } = useTranslation(["settings", "common"]);
  const { data: session } = useQuery(sessionQueryOptions);
  const [pending, setPending] = useState<Locale | undefined>();

  const mutation = useMutation({
    ...setLocaleMutationOptions,
    onSuccess: async (_data, variables) => {
      await changeLocale(i18n, variables.locale);
      toast.success(t("language.saved"));
    },
    onError: (err) => toastError(err, t("language.failed")),
  });

  const current = isLocale(i18n.language) ? i18n.language : "en";
  const disabled =
    mutation.isPending || (pending ?? current) === current || isImpersonating(session);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("language.title")}</CardTitle>
        <CardDescription>{t("language.description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="locale-select">{t("language.label")}</Label>
          <Select value={pending ?? current} onValueChange={(v) => isLocale(v) && setPending(v)}>
            <SelectTrigger id="locale-select" className="w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LOCALES.map((locale) => (
                <SelectItem key={locale} value={locale}>
                  {t(`language.options.${locale}` as const)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          className="self-start"
          disabled={disabled}
          onClick={() => mutation.mutate({ locale: pending ?? current })}
        >
          {t("common:actions.save")}
        </Button>
      </CardContent>
    </Card>
  );
}
