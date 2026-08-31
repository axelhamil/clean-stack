import { toLocale } from "@packages/i18n";
import { Card, CardContent, CardHeader } from "@packages/ui/components/ui/card";
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
import { createFileRoute } from "@tanstack/react-router";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { SUB_PROCESSOR_KEYS } from "../../shared/sub-processor-labels";
import type { SubProcessor } from "../../shared/sub-processors.config";
import { SUB_PROCESSORS } from "../../shared/sub-processors.config";
import { UntranslatedBodyBanner } from "./components/untranslated-body-banner";

export const Route = createFileRoute("/legal/sub-processors")({
  component: SubProcessorsPage,
});

interface SubProcessorTableProps {
  processors: SubProcessor[];
  caption: string;
  t: TFunction<"common">;
}

function SubProcessorTable({ processors, caption, t }: SubProcessorTableProps) {
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
            <TableCell className="whitespace-normal">
              {t(SUB_PROCESSOR_KEYS[sp.id].purpose)}
            </TableCell>
            <TableCell>{t(SUB_PROCESSOR_KEYS[sp.id].region)}</TableCell>
            <TableCell>
              {sp.dpaUrl ? (
                <TextLink href={sp.dpaUrl} target="_blank" rel="noopener noreferrer">
                  DPA
                </TextLink>
              ) : (
                "—"
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function SubProcessorsPage() {
  const { t, i18n } = useTranslation("common");
  const locale = toLocale(i18n.language);
  const active = SUB_PROCESSORS.filter((sp) => sp.status === "active");
  const planned = SUB_PROCESSORS.filter((sp) => sp.status === "planned");

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-2">
        <TypographyH1>{t("legal.subProcessors.title")}</TypographyH1>
        <TypographyMuted>{t("legal.subProcessors.subtitle")}</TypographyMuted>
      </header>

      <UntranslatedBodyBanner show={locale !== "en"} />

      <Card>
        <CardHeader>
          <TypographyH2>What is a sub-processor?</TypographyH2>
        </CardHeader>
        <CardContent>
          <TypographyP className="my-0">
            A sub-processor is a third party engaged by the data controller (us) to process personal
            data on your behalf, as defined under RGPD Art. 28. These third parties receive access
            to personal data only to the extent necessary to operate the service. We ensure each
            sub-processor provides sufficient guarantees to implement appropriate technical and
            organisational measures so that processing meets RGPD requirements.
          </TypographyP>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <TypographyH2>Active sub-processors</TypographyH2>
        </CardHeader>
        <CardContent>
          <SubProcessorTable
            processors={active}
            caption="Third-party processors currently used to operate the service"
            t={t}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <TypographyH2>Planned sub-processors</TypographyH2>
        </CardHeader>
        <CardContent>
          <SubProcessorTable
            processors={planned}
            caption="Third-party processors intended for future use — not yet active"
            t={t}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <TypographyH2>Change notice</TypographyH2>
        </CardHeader>
        <CardContent>
          <TypographyP className="my-0">
            In accordance with RGPD Art. 28§2, we will notify you at least 30 days before adding or
            replacing any sub-processor. If you object to a change, you may terminate the agreement
            before the change takes effect. Notifications are sent to the contact address on your
            account. For questions, contact{" "}
            <TextLink href="mailto:dpo@[domain]">dpo@[domain]</TextLink>.
          </TypographyP>
        </CardContent>
      </Card>
    </main>
  );
}
