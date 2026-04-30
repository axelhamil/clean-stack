import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@packages/ui/components/ui/card";
import { TypographyH1, TypographyMuted } from "@packages/ui/components/ui/typography";
import { CreateOrgForm } from "./_forms/create-org-form";

export function CreateOrgPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 px-6 py-10">
      <header className="flex flex-col gap-1">
        <TypographyH1 variant="page">Create organization</TypographyH1>
        <TypographyMuted>Spin up a new workspace for your team.</TypographyMuted>
      </header>
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
