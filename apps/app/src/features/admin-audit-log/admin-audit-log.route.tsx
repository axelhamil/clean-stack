import { Button } from "@packages/ui/components/ui/button";
import { Input } from "@packages/ui/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@packages/ui/components/ui/select";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@packages/ui/components/ui/table";
import { useInfiniteQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { type AuditRow, auditLogInfiniteQueryOptions } from "./api/audit-log.queries";
import type { AuditLogFilters } from "./audit-log-filters";
import { AuditTableRow } from "./components/audit-row";
import { ChainBadge } from "./components/chain-badge";
import { MetadataSheet } from "./components/metadata-sheet";

export const Route = createFileRoute("/_protected/_shell/_admin/admin/audit-log")({
  component: AdminAuditLogPage,
});

function AdminAuditLogPage() {
  const { t } = useTranslation("admin");
  const [filters, setFilters] = useState<AuditLogFilters>({});
  const [selected, setSelected] = useState<AuditRow | null>(null);

  const query = useInfiniteQuery(auditLogInfiniteQueryOptions(filters));

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-10">
      <div className="flex items-center gap-4">
        <h1 className="text-2xl font-semibold">{t("auditLog.pageTitle")}</h1>
        <ChainBadge />
      </div>

      <div className="flex flex-wrap gap-3">
        <Select
          value={filters.actionPrefix ?? ""}
          onValueChange={(v) => setFilters((f) => ({ ...f, actionPrefix: v || undefined }))}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder={t("auditLog.allActionsPlaceholder")} />
          </SelectTrigger>
          <SelectContent>
            {/* The prefix values below ("user.", "org.", …) are audit action
                type names, not copy — the brief calls these out explicitly as
                data, matching the "audit event type names … are data, not
                copy" rule for this screen. */}
            <SelectItem value="">{t("auditLog.allOption")}</SelectItem>
            <SelectItem value="user.">user.</SelectItem>
            <SelectItem value="org.">org.</SelectItem>
            <SelectItem value="billing.">billing.</SelectItem>
            <SelectItem value="security.">security.</SelectItem>
            <SelectItem value="webhook.">webhook.</SelectItem>
          </SelectContent>
        </Select>

        <Input
          type="date"
          className="w-44"
          value={filters.occurredFrom ?? ""}
          onChange={(e) => setFilters((f) => ({ ...f, occurredFrom: e.target.value || undefined }))}
        />

        <Input
          type="date"
          className="w-44"
          value={filters.occurredTo ?? ""}
          onChange={(e) => setFilters((f) => ({ ...f, occurredTo: e.target.value || undefined }))}
        />

        <Input
          placeholder={t("auditLog.actorIdPlaceholder")}
          className="w-52"
          value={filters.actorId ?? ""}
          onChange={(e) => setFilters((f) => ({ ...f, actorId: e.target.value || undefined }))}
        />

        <Input
          placeholder={t("auditLog.organizationIdPlaceholder")}
          className="w-52"
          value={filters.organizationId ?? ""}
          onChange={(e) =>
            setFilters((f) => ({ ...f, organizationId: e.target.value || undefined }))
          }
        />
      </div>

      {query.isLoading ? (
        <p>{t("auditLog.loading")}</p>
      ) : query.isError ? (
        <p>{t("auditLog.loadFailed")}</p>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("auditLog.table.occurredAt")}</TableHead>
                <TableHead>{t("auditLog.table.actorType")}</TableHead>
                <TableHead>{t("auditLog.table.action")}</TableHead>
                <TableHead>{t("auditLog.table.target")}</TableHead>
                <TableHead>{t("auditLog.table.organization")}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.data?.pages
                .flatMap((p) => p.items)
                .map((row) => (
                  <AuditTableRow key={row.id} row={row} onSelect={setSelected} />
                ))}
            </TableBody>
          </Table>

          {query.hasNextPage && (
            <Button
              variant="outline"
              disabled={query.isFetchingNextPage}
              onClick={() => query.fetchNextPage()}
            >
              {t("auditLog.loadMore")}
            </Button>
          )}
        </>
      )}

      <MetadataSheet row={selected} onClose={() => setSelected(null)} />
    </section>
  );
}
