import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@packages/ui/components/ui/card";
import { TypographyH1, TypographyMuted } from "@packages/ui/components/ui/typography";
import { useQuery } from "@tanstack/react-query";
import { activeOrgQueryOptions } from "../../shared/api/queries/active-org";
import { UpdateOrgForm } from "./forms/update-org-form";

export function GeneralPage() {
  const { data: org } = useQuery(activeOrgQueryOptions);

  if (!org) return <TypographyMuted>No active organization.</TypographyMuted>;

  return (
    <main className="flex flex-col gap-6">
      <TypographyH1 className="sr-only">Organization settings</TypographyH1>
      <Card>
        <CardHeader>
          <CardTitle>Organization details</CardTitle>
          <CardDescription>Rename your organization.</CardDescription>
        </CardHeader>
        <CardContent>
          <UpdateOrgForm organizationId={org.id} defaultValues={{ name: org.name }} />
        </CardContent>
      </Card>
    </main>
  );
}
