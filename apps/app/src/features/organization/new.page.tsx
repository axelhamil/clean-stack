import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@packages/ui/components/ui/card";
import { TypographyH1 } from "@packages/ui/components/ui/typography";
import { CreateOrgForm } from "./_forms/create-org-form";

export function CreateOrgPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 p-6">
      <TypographyH1>Create organization</TypographyH1>
      <Card>
        <CardHeader>
          <CardTitle>Organization details</CardTitle>
          <CardDescription>Give your organization a name and a unique slug.</CardDescription>
        </CardHeader>
        <CardContent>
          <CreateOrgForm />
        </CardContent>
      </Card>
    </main>
  );
}
