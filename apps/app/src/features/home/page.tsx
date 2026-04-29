import { Separator } from "@packages/ui/components/ui/separator";
import { AiReady } from "./_components/ai-ready";
import { ArchitectureFlow } from "./_components/architecture-flow";
import { FeaturesGrid } from "./_components/features-grid";
import { Hero } from "./_components/hero";
import { InTheBox } from "./_components/in-the-box";
import { Integrations } from "./_components/integrations";
import { NewsletterCard } from "./_components/newsletter-card";
import { QuickStart } from "./_components/quick-start";
import { SiteFooter } from "./_components/site-footer";
import { SiteHeader } from "./_components/site-header";
import { StackTabs } from "./_components/stack-tabs";
import { StatsBand } from "./_components/stats-band";
import { WhoItsFor } from "./_components/who-its-for";

export function HomePage() {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <SiteHeader />
      <main className="w-full flex-1 space-y-20 px-6 py-8 md:px-12 md:py-12">
        <Hero />
        <StatsBand />
        <Separator />
        <Integrations />
        <Separator />
        <FeaturesGrid />
        <Separator />
        <InTheBox />
        <Separator />
        <ArchitectureFlow />
        <Separator />
        <StackTabs />
        <Separator />
        <AiReady />
        <Separator />
        <WhoItsFor />
        <Separator />
        <QuickStart />
        <Separator />
        <NewsletterCard />
      </main>
      <SiteFooter />
    </div>
  );
}
