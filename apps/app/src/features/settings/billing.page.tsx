import { Badge } from "@packages/ui/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@packages/ui/components/ui/card";
import { TypographyMuted } from "@packages/ui/components/ui/typography";

export function SettingsBillingPage() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Billing</CardTitle>
          <Badge variant="secondary">Coming soon</Badge>
        </div>
        <CardDescription>Plan, payment methods and invoices.</CardDescription>
      </CardHeader>
      <CardContent>
        <TypographyMuted>
          Plug the Stripe plugin here — plans, customer portal and invoices will appear once
          configured.
        </TypographyMuted>
      </CardContent>
    </Card>
  );
}
