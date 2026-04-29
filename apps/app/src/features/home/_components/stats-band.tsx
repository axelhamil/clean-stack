import {
  TypographyH2,
  TypographyMuted,
} from "@packages/ui/components/ui/typography";

const stats = [
  { value: "~7ms", label: "Bun build (cold)" },
  { value: "100%", label: "End-to-end typed (Hono RPC)" },
  { value: "0", label: "Imports externes en domain" },
  { value: "9", label: "Règles d'architecture" },
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
