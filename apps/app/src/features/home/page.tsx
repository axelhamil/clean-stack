import { Badge } from "@packages/ui/components/ui/badge";
import { Separator } from "@packages/ui/components/ui/separator";
import { Boxes } from "lucide-react";
import { FeaturesGrid } from "./_components/features-grid";
import { Hero } from "./_components/hero";
import { NewsletterCard } from "./_components/newsletter-card";

export function HomePage() {
  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-2">
            <Boxes className="size-5" />
            <span className="font-semibold">clean-stack</span>
          </div>
          <Badge variant="secondary">v1.2.0</Badge>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-16">
        <Hero />
        <Separator className="my-16" />
        <FeaturesGrid />
        <Separator className="my-16" />
        <NewsletterCard />
      </main>
    </div>
  );
}
