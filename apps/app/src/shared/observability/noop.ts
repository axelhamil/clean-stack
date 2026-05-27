import type { ComponentProps, PropsWithChildren, ReactNode } from "react";

export function captureError(..._args: unknown[]): void {}

export function addBreadcrumb(..._args: unknown[]): void {}

export function ErrorBoundary({
  children,
  ..._props
}: PropsWithChildren<{
  fallback?: ReactNode;
  onError?: (...args: unknown[]) => void;
  beforeCapture?: (...args: unknown[]) => void;
  onReset?: (...args: unknown[]) => void;
  onUnmount?: (...args: unknown[]) => void;
  resetKeys?: unknown[];
}> &
  Omit<ComponentProps<"div">, "onError">): ReactNode {
  return children;
}

export function reactErrorHandler() {
  return (
    _error: unknown,
    _errorInfo: { componentStack?: string | null; digest?: string | null },
  ) => {};
}
