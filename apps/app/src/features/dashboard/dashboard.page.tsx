import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@packages/ui/components/ui/card";
import { TypographyH1, TypographyMuted, TypographyP } from "@packages/ui/components/ui/typography";
import { getRouteApi } from "@tanstack/react-router";
import { displayName } from "../../shared/utils";

const route = getRouteApi("/_protected/_shell/dashboard");

export function DashboardPage() {
  const { user } = route.useRouteContext();
  const firstName = displayName(user).split(" ")[0] ?? "";

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-1">
        <TypographyH1 variant="page">Welcome back, {firstName}</TypographyH1>
        <TypographyMuted>Here's what's happening today.</TypographyMuted>
      </header>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Getting started</CardTitle>
            <CardDescription>Configure your workspace.</CardDescription>
          </CardHeader>
          <CardContent>
            <TypographyP>
              Invite teammates, configure billing, and start shipping. Everything lives under
              Settings.
            </TypographyP>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Activity</CardTitle>
            <CardDescription>Recent events in your workspace.</CardDescription>
          </CardHeader>
          <CardContent>
            <TypographyMuted>Nothing yet — your activity will surface here.</TypographyMuted>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Usage</CardTitle>
            <CardDescription>Quota and limits for the current period.</CardDescription>
          </CardHeader>
          <CardContent>
            <TypographyMuted>Hook up metering once a billable resource exists.</TypographyMuted>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
