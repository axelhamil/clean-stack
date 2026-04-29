import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@packages/ui/components/ui/card";
import { NewsletterForm } from "../_forms/newsletter-form";

export function NewsletterCard() {
  return (
    <Card className="mx-auto max-w-md">
      <CardHeader>
        <CardTitle>Newsletter</CardTitle>
        <CardDescription>Reçois les updates du boilerplate.</CardDescription>
      </CardHeader>
      <CardContent>
        <NewsletterForm />
      </CardContent>
    </Card>
  );
}
