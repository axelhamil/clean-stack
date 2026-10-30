import { type AuditMetadataRow, AuditMetadataSheet } from "@packages/staff-ui/audit-metadata-sheet";
import { ChainBadge } from "@packages/staff-ui/chain-badge";
import { Button } from "@packages/ui/components/ui/button";
import { Input } from "@packages/ui/components/ui/input";
import { PageHeader } from "@packages/ui/components/ui/page-header";
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
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@packages/ui/components/ui/table";
import { TypographyInline, TypographyMuted } from "@packages/ui/components/ui/typography";
import { useFormatDateTime } from "@packages/web-kit/i18n/use-format-date";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { requireSection } from "../../shared/auth/require-section";
import { QueryList } from "../../shared/components/query-list";
import { StaffPage } from "../../shared/components/staff-page";
import { useDebouncedFilter } from "../../shared/hooks/use-debounced-filter";
import { auditInfiniteQueryOptions, chainVerifyQueryOptions } from "./api/audit.queries";
import { AUDIT_ACTION_PREFIXES, auditQueryOf, auditSearchSchema } from "./audit-filters";

const ALL = "all";
const ACTION_PREFIXES = ["user.", "org.", "billing.", "security.", "webhook.", "admin."] as const;

export const Route = createFileRoute("/_staff/audit")({
  validateSearch: auditSearchSchema,
  beforeLoad: requireSection("audit"),
  component: AuditPage,
});

function AuditPage() {
  const { t } = useTranslation("admin");
  const formatDateTime = useFormatDateTime();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [selected, setSelected] = useState<AuditMetadataRow | null>(null);
  const query = useInfiniteQuery(auditInfiniteQueryOptions(auditQueryOf(search)));
  const verification = useQuery(chainVerifyQueryOptions);

  const [actor, setActor] = useDebouncedFilter(search.actor ?? "", (value) =>
    navigate({ search: (prev) => ({ ...prev, actor: value || undefined }), replace: true }),
  );
  const [org, setOrg] = useDebouncedFilter(search.org ?? "", (value) =>
    navigate({ search: (prev) => ({ ...prev, org: value || undefined }), replace: true }),
  );

  return (
    <StaffPage>
      <PageHeader
        title={t("auditLog.pageTitle")}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ChainBadge verification={verification.isFetching ? undefined : verification.data} />
            <Button
              variant="outline"
              size="sm"
              disabled={verification.isFetching}
              onClick={() => verification.refetch()}
            >
              {t("auditLog.chain.verifyAgain")}
            </Button>
          </div>
        }
      />
      {verification.isError && <TypographyMuted>{t("auditLog.chain.failed")}</TypographyMuted>}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Select
          value={search.action ?? ALL}
          onValueChange={(value) => {
            const action = ACTION_PREFIXES.find((prefix) => prefix === value);
            void navigate({ search: (prev) => ({ ...prev, action }), replace: true });
          }}
        >
          <SelectTrigger aria-label={t("auditLog.table.action")} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("auditLog.allActionsPlaceholder")}</SelectItem>
            {ACTION_PREFIXES.map((prefix) => (
              <SelectItem key={prefix} value={prefix}>
                {t(AUDIT_ACTION_PREFIXES[prefix])}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="date"
          aria-label={t("auditLog.occurredFromLabel")}
          value={search.from ?? ""}
          onChange={(event) =>
            navigate({
              search: (prev) => ({ ...prev, from: event.target.value || undefined }),
              replace: true,
            })
          }
        />
        <Input
          type="date"
          aria-label={t("auditLog.occurredToLabel")}
          value={search.to ?? ""}
          onChange={(event) =>
            navigate({
              search: (prev) => ({ ...prev, to: event.target.value || undefined }),
              replace: true,
            })
          }
        />
        <Input
          aria-label={t("auditLog.actorIdPlaceholder")}
          placeholder={t("auditLog.actorIdPlaceholder")}
          value={actor}
          onChange={(event) => setActor(event.target.value)}
        />
        <Input
          aria-label={t("auditLog.organizationIdPlaceholder")}
          placeholder={t("auditLog.organizationIdPlaceholder")}
          value={org}
          onChange={(event) => setOrg(event.target.value)}
        />
      </div>

      <QueryList
        query={query}
        columns={4}
        loadingLabel={t("auditLog.loading")}
        errorMessage={t("auditLog.loadFailed")}
        emptyMessage={t("auditLog.empty")}
      >
        {(rows) => (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("auditLog.table.action")}</TableHead>
                <TableHead className="hidden md:table-cell">
                  {t("auditLog.table.actorType")}
                </TableHead>
                <TableHead className="hidden lg:table-cell">{t("auditLog.table.target")}</TableHead>
                <TableHead>
                  <span className="sr-only">{t("auditLog.detailsAction")}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="whitespace-normal wrap-anywhere">
                    <TypographyInline font="mono" size="xs">
                      {row.action}
                    </TypographyInline>
                    <TypographyMuted>{formatDateTime(row.occurredAt)}</TypographyMuted>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {t(`auditLog.actorType.${row.actorType}`)}
                  </TableCell>
                  <TableCell className="hidden whitespace-normal wrap-anywhere lg:table-cell">
                    <TypographyInline font="mono" size="xs" tone="muted">
                      {row.targetType} / {row.targetId}
                    </TypographyInline>
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" onClick={() => setSelected(row)}>
                      {t("auditLog.detailsAction")}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </QueryList>

      <AuditMetadataSheet row={selected} onClose={() => setSelected(null)} />
    </StaffPage>
  );
}
