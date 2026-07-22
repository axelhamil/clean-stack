import { Badge } from "@packages/ui/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@packages/ui/components/ui/card";
import { TypographyMuted } from "@packages/ui/components/ui/typography";
import { useQuery } from "@tanstack/react-query";
import { policiesQueryOptions } from "../../../shared/api/queries/policies";

const POLICY_LABELS: Record<string, string> = {
  privacy: "Privacy Policy",
  terms: "Terms of Service",
};

export function PolicyAcceptanceCard() {
  const { data, isLoading } = useQuery(policiesQueryOptions);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Policy acceptance</CardTitle>
        <CardDescription>
          Your acceptance status for the current versions of our policies.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <TypographyMuted>Loading…</TypographyMuted>
        ) : data ? (
          <ul className="flex flex-col divide-y">
            {Object.entries(data).map(([type, status]) => (
              <li key={type} className="flex items-center justify-between gap-4 py-3">
                <span className="text-sm font-medium">{POLICY_LABELS[type] ?? type}</span>
                <div className="flex items-center gap-3">
                  <TypographyMuted className="text-xs">
                    {status.acceptedVersion ? `v${status.acceptedVersion}` : "Never accepted"}
                  </TypographyMuted>
                  {status.current ? (
                    <Badge variant="secondary">Up to date</Badge>
                  ) : (
                    <Badge variant="destructive">Update required</Badge>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <TypographyMuted>Could not load policy status.</TypographyMuted>
        )}
      </CardContent>
    </Card>
  );
}
