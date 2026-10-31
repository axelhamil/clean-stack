import { Badge } from "@packages/ui/components/ui/badge";
import { SkeletonTable } from "@packages/ui/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@packages/ui/components/ui/table";
import { TypographyH2, TypographyMuted } from "@packages/ui/components/ui/typography";
import { useFormatDateTime } from "@packages/web-kit/i18n/use-format-date";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { LoadErrorRetry } from "../../../shared/components/load-error-retry";
import { sweepsQueryOptions } from "../api/ops.queries";
import { SWEEP_OUTCOME_LABEL_KEYS } from "../operations-labels";

export function JobsSection() {
  const { t } = useTranslation("admin");
  const formatDateTime = useFormatDateTime();
  const query = useQuery(sweepsQueryOptions);

  return (
    <section className="flex flex-col gap-4">
      <TypographyH2>{t("operations.jobs.title")}</TypographyH2>

      {query.isPending && <SkeletonTable label={t("operations.jobs.loading")} columns={4} />}

      {query.isError && (
        <LoadErrorRetry message={t("operations.jobs.loadFailed")} onRetry={query.refetch} />
      )}

      {query.data?.items.length === 0 && (
        <TypographyMuted>{t("operations.jobs.empty")}</TypographyMuted>
      )}

      {query.data && query.data.items.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("operations.jobs.table.job")}</TableHead>
              <TableHead>{t("operations.jobs.table.outcome")}</TableHead>
              <TableHead className="hidden md:table-cell">
                {t("operations.jobs.table.finishedAt")}
              </TableHead>
              <TableHead className="hidden md:table-cell">
                {t("operations.jobs.table.count")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {query.data.items.map((run) => (
              <TableRow key={run.label}>
                <TableCell className="whitespace-normal wrap-anywhere">{run.label}</TableCell>
                <TableCell>
                  <Badge
                    variant={
                      run.outcome === "ok" || run.outcome === "truncated"
                        ? "secondary"
                        : "destructive"
                    }
                  >
                    {t(SWEEP_OUTCOME_LABEL_KEYS[run.outcome])}
                  </Badge>
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  {formatDateTime(run.finishedAt)}
                </TableCell>
                <TableCell className="hidden md:table-cell">{run.count}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}
