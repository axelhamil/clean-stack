import { Button } from "@packages/ui/components/ui/button";
import { SkeletonTable } from "@packages/ui/components/ui/skeleton";
import { TypographyMuted } from "@packages/ui/components/ui/typography";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { LoadErrorRetry } from "./load-error-retry";

export interface PagedQuery<T> {
  data?: { pages: { items: T[] }[] };
  isPending: boolean;
  isError: boolean;
  isFetchNextPageError: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => unknown;
  refetch: () => unknown;
}

export interface QueryListProps<T> {
  query: PagedQuery<T>;
  loadingLabel: string;
  errorMessage: string;
  emptyMessage: string;
  columns: number;
  children: (items: T[]) => ReactNode;
}

export function QueryList<T>({
  query,
  loadingLabel,
  errorMessage,
  emptyMessage,
  columns,
  children,
}: QueryListProps<T>) {
  const { t } = useTranslation("admin");

  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  const hasItems = items.length > 0;
  const retry = query.isFetchNextPageError ? query.fetchNextPage : query.refetch;

  if (query.isPending) return <SkeletonTable label={loadingLabel} columns={columns} />;

  if (!hasItems && query.isError) return <LoadErrorRetry message={errorMessage} onRetry={retry} />;

  if (!hasItems) return <TypographyMuted>{emptyMessage}</TypographyMuted>;

  return (
    <>
      {children(items)}
      {query.isError && <LoadErrorRetry message={errorMessage} onRetry={retry} />}
      {query.hasNextPage && !query.isError && (
        <Button
          variant="outline"
          className="self-start"
          disabled={query.isFetchingNextPage}
          onClick={() => query.fetchNextPage()}
        >
          {t("backOffice.loadMore")}
        </Button>
      )}
    </>
  );
}

export interface ItemsQueryListProps<T> {
  query: { isPending: boolean; isError: boolean; refetch: () => unknown };
  items: T[];
  loadingLabel: string;
  errorMessage: string;
  emptyMessage: string;
  columns: number;
  rows?: number;
  children: (items: T[]) => ReactNode;
}

export function ItemsQueryList<T>({
  query,
  items,
  loadingLabel,
  errorMessage,
  emptyMessage,
  columns,
  rows,
  children,
}: ItemsQueryListProps<T>) {
  if (query.isPending) return <SkeletonTable label={loadingLabel} columns={columns} rows={rows} />;

  const retry = query.isError && <LoadErrorRetry message={errorMessage} onRetry={query.refetch} />;

  if (items.length === 0) return retry || <TypographyMuted>{emptyMessage}</TypographyMuted>;

  return (
    <>
      {children(items)}
      {retry}
    </>
  );
}
