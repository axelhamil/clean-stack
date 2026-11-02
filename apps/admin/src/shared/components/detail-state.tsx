import { PageHeader } from "@packages/ui/components/ui/page-header";
import { SkeletonTable } from "@packages/ui/components/ui/skeleton";
import { TypographyH1 } from "@packages/ui/components/ui/typography";
import type { ReactNode } from "react";
import { LoadErrorRetry } from "./load-error-retry";
import { StaffPage } from "./staff-page";

export interface DetailQuery<T> {
  data?: T;
  isError: boolean;
  refetch: () => unknown;
}

export interface DetailStateProps<T> {
  query: DetailQuery<T>;
  back: ReactNode;
  fallbackTitle: string;
  loadingLabel: string;
  errorMessage: string;
  children: (data: T) => ReactNode;
}

export function DetailState<T>({
  query,
  back,
  fallbackTitle,
  loadingLabel,
  errorMessage,
  children,
}: DetailStateProps<T>) {
  if (query.data) {
    return (
      <StaffPage>
        {back}
        {children(query.data)}
      </StaffPage>
    );
  }

  if (query.isError) {
    return (
      <StaffPage>
        {back}
        <PageHeader title={fallbackTitle} />
        <LoadErrorRetry message={errorMessage} onRetry={query.refetch} />
      </StaffPage>
    );
  }

  return (
    <StaffPage>
      {back}
      <TypographyH1 variant="page">{fallbackTitle}</TypographyH1>
      <SkeletonTable label={loadingLabel} columns={2} />
    </StaffPage>
  );
}
