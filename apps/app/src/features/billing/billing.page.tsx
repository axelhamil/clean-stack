import { Badge } from "@packages/ui/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@packages/ui/components/ui/card";
import { TypographyH1, TypographyMuted } from "@packages/ui/components/ui/typography";

export function BillingPage() {
  return (
    <main className="flex flex-col gap-6">
      <TypographyH1 className="sr-only">Billing settings</TypographyH1>
      <Card>
        <CardHeader>
          <CardTitle>Billing</CardTitle>
          <CardDescription>Plan, payment methods and invoices.</CardDescription>
          <CardAction>
            <Badge variant="secondary">Coming soon</Badge>
          </CardAction>
        </CardHeader>
        <CardContent>
          <TypographyMuted>
            Plug the Stripe plugin here — plans, customer portal and invoices will appear once
            configured.
          </TypographyMuted>
        </CardContent>
      </Card>
    </main>
  );
}
