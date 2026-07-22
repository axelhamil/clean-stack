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
import { useState } from "react";
import { type AuditRow, auditLogInfiniteQueryOptions } from "./api/audit-log.queries";
import type { AuditLogFilters } from "./audit-log-filters";
import { AuditTableRow } from "./components/audit-row";
import { ChainBadge } from "./components/chain-badge";
import { MetadataSheet } from "./components/metadata-sheet";

export function AdminAuditLogPage() {
  const [filters, setFilters] = useState<AuditLogFilters>({});
  const [selected, setSelected] = useState<AuditRow | null>(null);

  const query = useInfiniteQuery(auditLogInfiniteQueryOptions(filters));

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-10">
      <div className="flex items-center gap-4">
        <h1 className="text-2xl font-semibold">Audit log</h1>
        <ChainBadge />
      </div>

      <div className="flex flex-wrap gap-3">
        <Select
          value={filters.actionPrefix ?? ""}
          onValueChange={(v) => setFilters((f) => ({ ...f, actionPrefix: v || undefined }))}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All actions" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All</SelectItem>
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
          placeholder="Actor ID"
          className="w-52"
          value={filters.actorId ?? ""}
          onChange={(e) => setFilters((f) => ({ ...f, actorId: e.target.value || undefined }))}
        />

        <Input
          placeholder="Organization ID"
          className="w-52"
          value={filters.organizationId ?? ""}
          onChange={(e) =>
            setFilters((f) => ({ ...f, organizationId: e.target.value || undefined }))
          }
        />
      </div>

      {query.isLoading ? (
        <p>Loading…</p>
      ) : query.isError ? (
        <p>Failed to load audit log.</p>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Occurred at</TableHead>
                <TableHead>Actor type</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Organization</TableHead>
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
              Load more
            </Button>
          )}
        </>
      )}

      <MetadataSheet row={selected} onClose={() => setSelected(null)} />
    </section>
  );
}
