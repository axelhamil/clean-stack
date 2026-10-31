import { Badge } from "@packages/ui/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@packages/ui/components/ui/table";
import { TypographyH2 } from "@packages/ui/components/ui/typography";
import { useFormatDateTime } from "@packages/web-kit/i18n/use-format-date";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ItemsQueryList } from "../../../shared/components/query-list";
import { sweepStateView } from "../../../shared/labels/sweep-outcome";
import { sweepsQueryOptions } from "../api/ops.queries";

export function JobsSection() {
  const { t } = useTranslation("admin");
  const formatDateTime = useFormatDateTime();
  const query = useQuery(sweepsQueryOptions);

  return (
    <section className="flex flex-col gap-4">
      <TypographyH2>{t("operations.jobs.title")}</TypographyH2>

      <ItemsQueryList
        query={query}
        items={query.data?.items ?? []}
        loadingLabel={t("operations.jobs.loading")}
        errorMessage={t("operations.jobs.loadFailed")}
        emptyMessage={t("operations.jobs.empty")}
        columns={4}
      >
        {(runs) => (
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
              {runs.map((run) => {
                const state = sweepStateView(run);

                return (
                  <TableRow key={run.label}>
                    <TableCell className="whitespace-normal wrap-anywhere">{run.label}</TableCell>
                    <TableCell>
                      <Badge variant={state.variant}>{t(state.labelKey)}</Badge>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {formatDateTime(run.finishedAt)}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{run.count}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </ItemsQueryList>
    </section>
  );
}
