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
          <CardTitle>Stay in the loop</CardTitle>
          <CardDescription>
            One release, one breaking change, one architecture decision → one
            short email. Never spam.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <NewsletterForm />
        </CardContent>
      </Card>
    </section>
  );
}
