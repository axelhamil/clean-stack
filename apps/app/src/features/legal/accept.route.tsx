import { Badge } from "@packages/ui/components/ui/badge";
import { Button } from "@packages/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@packages/ui/components/ui/card";
import {
  TypographyH1,
  TypographyMuted,
  TypographySmall,
} from "@packages/ui/components/ui/typography";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { policiesQueryOptions } from "../../shared/api/queries/policies";
import { PolicyLink } from "../../shared/components/policy-link";
import { ThemeToggle } from "../../shared/components/theme-toggle";
import { isPolicyType, POLICY_TITLE_KEYS } from "../../shared/legal/policy-labels";
import { useAcceptPolicies } from "./hooks/use-accept-policies";
import { getChangesSince, POLICY_DOCS } from "./policies.config";

const searchSchema = z.object({
  redirect: z.string().optional(),
});

export const Route = createFileRoute("/_protected/legal/accept")({
  validateSearch: searchSchema,
  component: AcceptPoliciesPage,
});

function AcceptPoliciesPage() {
  const { t } = useTranslation("common");
  const { redirect } = Route.useSearch();
  const navigate = useNavigate();
  const { data: policies } = useQuery(policiesQueryOptions);

  const staleTypes = policies
    ? (Object.entries(policies) as [string, { current: boolean; acceptedVersion: string | null }][])
        .filter(([, status]) => !status.current)
        .map(([type]) => type)
        .filter(isPolicyType)
    : [];

  const isReacceptance = staleTypes.some((type) => policies?.[type]?.acceptedVersion != null);

  const mutation = useAcceptPolicies(redirect);

  useEffect(() => {
    if (policies && staleTypes.length === 0) {
      void navigate({ to: redirect ?? "/dashboard" });
    }
  }, [policies, staleTypes.length, navigate, redirect]);

  if (!policies || staleTypes.length === 0) return null;

  return (
    <main className="relative flex min-h-dvh items-center justify-center p-4">
      <ThemeToggle className="absolute top-4 right-4" />

      <div className="flex w-full max-w-lg flex-col gap-6">
        <header className="flex flex-col gap-2">
          <TypographyH1>
            {isReacceptance ? t("legal.accept.titleReacceptance") : t("legal.accept.title")}
          </TypographyH1>
          <TypographyMuted>
            {isReacceptance ? t("legal.accept.subtitleReacceptance") : t("legal.accept.subtitle")}
          </TypographyMuted>
        </header>

        {staleTypes.map((type) => {
          const doc = POLICY_DOCS[type];
          const title = t(POLICY_TITLE_KEYS[type]);
          const acceptedVersion = policies[type]?.acceptedVersion ?? null;
          const changes = acceptedVersion ? getChangesSince(type, acceptedVersion) : [];

          return (
            <Card key={type}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {title}
                  {acceptedVersion ? (
                    <Badge variant="secondary">{t("legal.accept.updatedBadge")}</Badge>
                  ) : null}
                </CardTitle>
                <CardDescription>
                  {t("legal.policies.versionLine", {
                    version: doc.version,
                    date: doc.effectiveDate,
                  })}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {changes.map((entry) => (
                  <div key={entry.version} className="flex flex-col gap-1">
                    <TypographySmall>{entry.version}</TypographySmall>
                    <TypographyMuted>{entry.summary}</TypographyMuted>
                  </div>
                ))}
                <TypographyMuted>
                  <PolicyLink type={type}>{t("legal.accept.readFull", { title })}</PolicyLink>
                </TypographyMuted>
              </CardContent>
            </Card>
          );
        })}

        <Button
          className="w-full"
          onClick={() => mutation.mutate({})}
          disabled={mutation.isPending}
        >
          {mutation.isPending ? t("legal.accept.acceptingButton") : t("legal.accept.acceptButton")}
        </Button>
      </div>
    </main>
  );
}
