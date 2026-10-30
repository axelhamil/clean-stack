import { toLocale } from "@packages/i18n";
import { pageContainerVariants } from "@packages/ui/components/ui/page-container";
import { Separator } from "@packages/ui/components/ui/separator";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@packages/ui/components/ui/table";
import { TextLink } from "@packages/ui/components/ui/text-link";
import {
  TypographyH1,
  TypographyH2,
  TypographyMuted,
  TypographyP,
} from "@packages/ui/components/ui/typography";
import { cn } from "@packages/ui/libs/utils.js";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { SUB_PROCESSOR_KEYS } from "../../shared/sub-processor-labels";
import { SUB_PROCESSORS, type SubProcessor } from "../../shared/sub-processors.config";
import { UntranslatedBodyBanner } from "./components/untranslated-body-banner";

export const Route = createFileRoute("/legal/sub-processors")({
  component: SubProcessorsPage,
});

interface SubProcessorTableProps {
  processors: readonly SubProcessor[];
  caption: string;
}

function SubProcessorTable({ processors, caption }: SubProcessorTableProps) {
  const { t } = useTranslation("common");

  return (
    <Table>
      <TableCaption>{caption}</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>{t("legal.subProcessors.table.name")}</TableHead>
          <TableHead>{t("legal.subProcessors.table.purpose")}</TableHead>
          <TableHead>{t("legal.subProcessors.table.region")}</TableHead>
          <TableHead>{t("legal.subProcessors.table.dpa")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {processors.map((sp) => (
          <TableRow key={sp.name}>
            <TableCell>
              {sp.url ? (
                <TextLink href={sp.url} target="_blank" rel="noopener noreferrer">
                  {sp.name}
                </TextLink>
              ) : (
                sp.name
              )}
            </TableCell>
            <TableCell className="min-w-56 whitespace-normal">
              {t(SUB_PROCESSOR_KEYS[sp.id].purpose)}
            </TableCell>
            <TableCell>{t(SUB_PROCESSOR_KEYS[sp.id].region)}</TableCell>
            <TableCell>
              {sp.dpaUrl ? (
                <TextLink href={sp.dpaUrl} target="_blank" rel="noopener noreferrer">
                  DPA
                </TextLink>
              ) : (
                "N/A"
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function SubProcessorsPage() {
  const { t, i18n } = useTranslation("common");
  const locale = toLocale(i18n.language);
  const active = SUB_PROCESSORS.filter((sp) => sp.status === "active");
  const planned = SUB_PROCESSORS.filter((sp) => sp.status === "planned");

  return (
    <main className={cn(pageContainerVariants({ width: "prose" }), "flex flex-col gap-8 py-8")}>
      <header className="flex flex-col gap-2">
        <TypographyH1 variant="page">{t("legal.subProcessors.title")}</TypographyH1>
        <TypographyMuted>{t("legal.subProcessors.subtitle")}</TypographyMuted>
      </header>

      <Separator />

      <UntranslatedBodyBanner show={locale !== "en"} />

      <section className="flex flex-col gap-3">
        <TypographyH2>What is a sub-processor?</TypographyH2>
        <TypographyP>
          A sub-processor is a third party engaged by the data controller (us) to process personal
          data on your behalf, as defined under RGPD Art. 28. These third parties receive access to
          personal data only to the extent necessary to operate the service. We ensure each
          sub-processor provides sufficient guarantees to implement appropriate technical and
          organisational measures so that processing meets RGPD requirements.
        </TypographyP>
      </section>

      <section className="flex flex-col gap-3">
        <TypographyH2>Active sub-processors</TypographyH2>
        <SubProcessorTable
          processors={active}
          caption="Third-party processors currently used to operate the service"
        />
      </section>

      <section className="flex flex-col gap-3">
        <TypographyH2>Planned sub-processors</TypographyH2>
        <SubProcessorTable
          processors={planned}
          caption="Third-party processors intended for future use, not yet active"
        />
      </section>

      <section className="flex flex-col gap-3">
        <TypographyH2>Change notice</TypographyH2>
        <TypographyP>
          In accordance with RGPD Art. 28§2, we will notify you at least 30 days before adding or
          replacing any sub-processor. If you object to a change, you may terminate the agreement
          before the change takes effect. Notifications are sent to the contact address on your
          account. For questions, contact{" "}
          <TextLink href="mailto:dpo@[domain]">dpo@[domain]</TextLink>.
        </TypographyP>
      </section>
    </main>
  );
}
