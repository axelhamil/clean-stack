import {
  TypographyH2,
  TypographyMuted,
} from "@packages/ui/components/ui/typography";

const stats = [
  { value: "~7ms", label: "Production build (cold, Bun)" },
  { value: "100%", label: "TypeScript strict, end-to-end" },
  { value: "0", label: "throw, null, barrel in domain" },
  { value: "14", label: "Non-negotiable architecture rules" },
];

export function StatsBand() {
  return (
    <section className="grid grid-cols-2 gap-8 md:grid-cols-4">
      {stats.map((s) => (
        <div key={s.label} className="space-y-1 text-center">
          <TypographyH2 className="border-0 pb-0">{s.value}</TypographyH2>
          <TypographyMuted>{s.label}</TypographyMuted>
        </div>
      ))}
    </section>
  );
}
