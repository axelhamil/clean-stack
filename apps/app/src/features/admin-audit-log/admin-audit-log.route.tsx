import { AuditMetadataSheet } from "@packages/staff-ui/audit-metadata-sheet";
import { ChainBadge } from "@packages/staff-ui/chain-badge";
import { Button } from "@packages/ui/components/ui/button";
import { Input } from "@packages/ui/components/ui/input";
import { LoadErrorAlert } from "@packages/ui/components/ui/load-error-alert";
import { PageHeader } from "@packages/ui/components/ui/page-header";
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
import { TypographyMuted } from "@packages/ui/components/ui/typography";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ensureStaffPermission } from "../../shared/auth/ensure-staff";
import {
  type AuditRow,
  auditLogInfiniteQueryOptions,
  chainVerifyQueryOptions,
} from "./api/audit-log.queries";
import type { AuditLogFilters } from "./audit-log-filters";
import { AuditTableRow } from "./components/audit-row";

const ALL_ACTIONS = "all";

export const Route = createFileRoute("/_protected/_shell/_admin/admin/audit-log")({
  beforeLoad: ensureStaffPermission("audit.read"),
  component: AdminAuditLogPage,
});

function AdminAuditLogPage() {
  const { t } = useTranslation("admin");
  const [filters, setFilters] = useState<AuditLogFilters>({});
  const [selected, setSelected] = useState<AuditRow | null>(null);

  const query = useInfiniteQuery(auditLogInfiniteQueryOptions(filters));
  const verification = useQuery(chainVerifyQueryOptions);
  const rows = query.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <main className="flex flex-col gap-6">
      <PageHeader
        title={t("auditLog.pageTitle")}
        actions={<ChainBadge verification={verification.data} />}
      />

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

      {query.isError && <LoadErrorAlert message={t("auditLog.loadFailed")} />}

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

      <AuditMetadataSheet row={selected} onClose={() => setSelected(null)} />
    </main>
  );
}
