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
import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { policiesQueryOptions } from "../../shared/api/queries/policies";
import { PolicyLink } from "../../shared/components/policy-link";
import { ThemeToggle } from "../../shared/components/theme-toggle";
import { useAcceptPolicies } from "./hooks/use-accept-policies";
import { getChangesSince, POLICY_DOCS } from "./policies.config";

const routeApi = getRouteApi("/_protected/legal/accept");

export function AcceptPoliciesPage() {
  const { redirect } = routeApi.useSearch();
  const navigate = useNavigate();
  const { data: policies } = useQuery(policiesQueryOptions);

  const staleTypes = policies
    ? (Object.entries(policies) as [string, { current: boolean; acceptedVersion: string | null }][])
        .filter(([, status]) => !status.current)
        .map(([type]) => type as keyof typeof POLICY_DOCS)
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
            {isReacceptance ? "Updated policies" : "Before you get started"}
          </TypographyH1>
          <TypographyMuted>
            {isReacceptance
              ? "We've updated our policies. Please review the changes and accept to continue."
              : "Please review and accept our Privacy Policy and Terms to continue."}
          </TypographyMuted>
        </header>

        {staleTypes.map((type) => {
          const doc = POLICY_DOCS[type];
          const acceptedVersion = policies[type]?.acceptedVersion ?? null;
          const changes = acceptedVersion ? getChangesSince(type, acceptedVersion) : [];

          return (
            <Card key={type}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {doc.title}
                  {acceptedVersion ? <Badge variant="secondary">Updated</Badge> : null}
                </CardTitle>
                <CardDescription>
                  Version {doc.version} — effective {doc.effectiveDate}
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
                  <PolicyLink type={type}>Read the full {doc.title}</PolicyLink>
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
          {mutation.isPending ? "Accepting…" : "Accept and continue"}
        </Button>
      </div>
    </main>
  );
}
