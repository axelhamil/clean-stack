import { Badge } from "@packages/ui/components/ui/badge";
import { Button } from "@packages/ui/components/ui/button";
import { pageContainerVariants } from "@packages/ui/components/ui/page-container";
import { Separator } from "@packages/ui/components/ui/separator";
import {
  TypographyH1,
  TypographyH2,
  TypographyMuted,
  TypographySmall,
} from "@packages/ui/components/ui/typography";
import { cn } from "@packages/ui/libs/utils.js";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Fragment, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { policiesQueryOptions } from "../../shared/api/queries/policies";
import { GuardHint } from "../../shared/auth/guard-hint";
import { ImpersonationReason } from "../../shared/auth/impersonation-reason";
import { useImpersonationGuard } from "../../shared/auth/use-impersonation-guard";
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
  const guard = useImpersonationGuard();
  const { data: policies } = useQuery(policiesQueryOptions);

  const staleTypes = policies
    ? Object.entries(policies)
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
    <div className="flex min-h-dvh flex-col">
      <header className="flex justify-end p-4">
        <ThemeToggle />
      </header>

      <main
        className={cn(
          pageContainerVariants({ width: "form" }),
          "flex flex-1 flex-col justify-center gap-6 pb-8",
        )}
      >
        <div className="flex flex-col gap-2">
          <TypographyH1 variant="page">
            {isReacceptance ? t("legal.accept.titleReacceptance") : t("legal.accept.title")}
          </TypographyH1>
          <TypographyMuted>
            {isReacceptance ? t("legal.accept.subtitleReacceptance") : t("legal.accept.subtitle")}
          </TypographyMuted>
        </div>

        {staleTypes.map((type) => {
          const doc = POLICY_DOCS[type];
          const title = t(POLICY_TITLE_KEYS[type]);
          const acceptedVersion = policies[type]?.acceptedVersion ?? null;
          const changes = acceptedVersion ? getChangesSince(type, acceptedVersion) : [];

          return (
            <Fragment key={type}>
              <Separator />
              <section className="flex flex-col gap-2">
                <TypographyH2 className="flex items-center gap-2">
                  {title}
                  {acceptedVersion ? (
                    <Badge variant="secondary">{t("legal.accept.updatedBadge")}</Badge>
                  ) : null}
                </TypographyH2>
                <TypographyMuted>
                  {t("legal.policies.versionLine", {
                    version: doc.version,
                    date: doc.effectiveDate,
                  })}
                </TypographyMuted>
                {changes.map((entry) => (
                  <div key={entry.version} className="flex flex-col gap-1">
                    <TypographySmall>{entry.version}</TypographySmall>
                    <TypographyMuted>{entry.summary}</TypographyMuted>
                  </div>
                ))}
                <TypographyMuted>
                  <PolicyLink type={type}>{t("legal.accept.readFull", { title })}</PolicyLink>
                </TypographyMuted>
              </section>
            </Fragment>
          );
        })}

        <GuardHint guard={guard} otherwiseDisabled={mutation.isPending} className="w-full">
          <Button
            className="w-full"
            onClick={() => mutation.mutate({})}
            disabled={mutation.isPending || guard.blocked}
            {...guard.describeProps(mutation.isPending)}
          >
            {mutation.isPending
              ? t("legal.accept.acceptingButton")
              : t("legal.accept.acceptButton")}
          </Button>
        </GuardHint>
        <ImpersonationReason guard={guard} />
      </main>
    </div>
  );
}
