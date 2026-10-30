import { Alert, AlertDescription } from "@packages/ui/components/ui/alert";
import { Button } from "@packages/ui/components/ui/button";
import { Input } from "@packages/ui/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@packages/ui/components/ui/select";
import { SkeletonTable } from "@packages/ui/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@packages/ui/components/ui/table";
import { TypographyH1, TypographyMuted } from "@packages/ui/components/ui/typography";
import { useInfiniteQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { type AuditRow, auditLogInfiniteQueryOptions } from "./api/audit-log.queries";
import type { AuditLogFilters } from "./audit-log-filters";
import { AuditTableRow } from "./components/audit-row";
import { ChainBadge } from "./components/chain-badge";
import { MetadataSheet } from "./components/metadata-sheet";

const ALL_ACTIONS = "all";

export const Route = createFileRoute("/_protected/_shell/_admin/admin/audit-log")({
  component: AdminAuditLogPage,
});

function AdminAuditLogPage() {
  const { t } = useTranslation("admin");
  const [filters, setFilters] = useState<AuditLogFilters>({});
  const [selected, setSelected] = useState<AuditRow | null>(null);

  const query = useInfiniteQuery(auditLogInfiniteQueryOptions(filters));
  const rows = query.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <main className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <TypographyH1 variant="page">{t("auditLog.pageTitle")}</TypographyH1>
        <ChainBadge />
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Select
          value={filters.actionPrefix ?? ALL_ACTIONS}
          onValueChange={(v) =>
            setFilters((f) => ({ ...f, actionPrefix: v === ALL_ACTIONS ? undefined : v }))
          }
        >
          <SelectTrigger
            aria-label={t("auditLog.table.action")}
            className="col-span-2 w-full sm:col-span-1"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_ACTIONS}>{t("auditLog.allActionsPlaceholder")}</SelectItem>
            <SelectItem value="user.">user.</SelectItem>
            <SelectItem value="org.">org.</SelectItem>
            <SelectItem value="billing.">billing.</SelectItem>
            <SelectItem value="security.">security.</SelectItem>
            <SelectItem value="webhook.">webhook.</SelectItem>
          </SelectContent>
        </Select>

        <Input
          type="date"
          aria-label={t("auditLog.occurredFromLabel")}
          value={filters.occurredFrom ?? ""}
          onChange={(e) => setFilters((f) => ({ ...f, occurredFrom: e.target.value || undefined }))}
        />

        <Input
          type="date"
          aria-label={t("auditLog.occurredToLabel")}
          value={filters.occurredTo ?? ""}
          onChange={(e) => setFilters((f) => ({ ...f, occurredTo: e.target.value || undefined }))}
        />

        <Input
          placeholder={t("auditLog.actorIdPlaceholder")}
          value={filters.actorId ?? ""}
          onChange={(e) => setFilters((f) => ({ ...f, actorId: e.target.value || undefined }))}
        />

        <Input
          placeholder={t("auditLog.organizationIdPlaceholder")}
          value={filters.organizationId ?? ""}
          onChange={(e) =>
            setFilters((f) => ({ ...f, organizationId: e.target.value || undefined }))
          }
        />
      </div>

      {query.isLoading && <SkeletonTable label={t("auditLog.loading")} columns={6} />}

      {query.isError && (
        <Alert variant="destructive">
          <AlertDescription>{t("auditLog.loadFailed")}</AlertDescription>
        </Alert>
      )}

      {query.isSuccess && rows.length === 0 && (
        <TypographyMuted>{t("auditLog.empty")}</TypographyMuted>
      )}

      {rows.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("auditLog.table.occurredAt")}</TableHead>
              <TableHead>{t("auditLog.table.actorType")}</TableHead>
              <TableHead>{t("auditLog.table.action")}</TableHead>
              <TableHead>{t("auditLog.table.target")}</TableHead>
              <TableHead>{t("auditLog.table.organization")}</TableHead>
              <TableHead>
                <span className="sr-only">{t("auditLog.detailsAction")}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <AuditTableRow key={row.id} row={row} onSelect={setSelected} />
            ))}
          </TableBody>
        </Table>
      )}

      {query.hasNextPage && (
        <Button
          variant="outline"
          className="self-start"
          disabled={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          {t("auditLog.loadMore")}
        </Button>
      )}

      <MetadataSheet row={selected} onClose={() => setSelected(null)} />
    </main>
  );
}
