import { Separator } from "@packages/ui/components/ui/separator";
import { ArchitectureFlow } from "./_components/architecture-flow";
import { FeaturesGrid } from "./_components/features-grid";
import { Hero } from "./_components/hero";
import { NewsletterCard } from "./_components/newsletter-card";
import { SiteFooter } from "./_components/site-footer";
import { SiteHeader } from "./_components/site-header";
import { StackTabs } from "./_components/stack-tabs";
import { StatsBand } from "./_components/stats-band";

export function HomePage() {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <SiteHeader />
      <main className="w-full flex-1 space-y-20 px-6 py-16 md:px-12 md:py-24">
        <Hero />
        <StatsBand />
        <Separator />
        <FeaturesGrid />
        <Separator />
        <StackTabs />
        <Separator />
        <ArchitectureFlow />
        <Separator />
        <NewsletterCard />
      </main>
      <SiteFooter />
    </div>
  );
}
