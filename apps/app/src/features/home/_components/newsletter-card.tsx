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
    <section id="newsletter">
      <Card className="mx-auto max-w-md">
        <CardHeader className="text-center">
          <CardTitle>Newsletter</CardTitle>
          <CardDescription>Reçois les updates du boilerplate.</CardDescription>
        </CardHeader>
        <CardContent>
          <NewsletterForm />
        </CardContent>
      </Card>
    </section>
  );
}
