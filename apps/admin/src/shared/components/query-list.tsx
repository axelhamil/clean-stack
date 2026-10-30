import { Button } from "@packages/ui/components/ui/button";
import { LoadErrorAlert } from "@packages/ui/components/ui/load-error-alert";
import { SkeletonTable } from "@packages/ui/components/ui/skeleton";
import { TypographyMuted } from "@packages/ui/components/ui/typography";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

export interface PagedQuery<T> {
  data?: { pages: { items: T[] }[] };
  isPending: boolean;
  isError: boolean;
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

  if (query.isPending) return <SkeletonTable label={loadingLabel} columns={columns} />;

  if (query.isError) {
    return (
      <LoadErrorAlert
        message={errorMessage}
        retry={
          <Button variant="outline" size="sm" onClick={() => query.refetch()}>
            {t("backOffice.reload")}
          </Button>
        }
      />
    );
  }

  const items = query.data?.pages.flatMap((page) => page.items) ?? [];

  if (items.length === 0) return <TypographyMuted>{emptyMessage}</TypographyMuted>;

  return (
    <>
      {children(items)}
      {query.hasNextPage && (
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
