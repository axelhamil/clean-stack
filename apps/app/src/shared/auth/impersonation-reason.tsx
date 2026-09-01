import type { ImpersonationGuard } from "./use-impersonation-guard";

interface ImpersonationReasonProps {
  guard: ImpersonationGuard;
}

/**
 * Renders the guard's reason as a real DOM text node, once per page/section,
 * so `aria-describedby={guard.descriptionId}` on every frozen control in
 * that section resolves to something a screen reader can read in browse
 * mode. Mounted only while blocked — an id nothing points at is harmless,
 * but this keeps the DOM free of a floating explanation for a state that
 * doesn't hold.
 */
export function ImpersonationReason({ guard }: ImpersonationReasonProps) {
  if (!guard.blocked) return null;
  return (
    <span id={guard.descriptionId} className="sr-only">
      {guard.reason}
    </span>
  );
}
