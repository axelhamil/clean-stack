import type { ConsentCategory } from "@packages/cookie-consent";
import { useQuery } from "@tanstack/react-query";
import { consentQueryOptions } from "../api/queries/consent";

/**
 * Returns true when the given category is active for the current visitor.
 * Use to gate conditional script loading (e.g. `useConsent("analytics")` before Umami).
 * "necessary" is always true; optional categories depend on the visitor's stored consent.
 */
export function useConsent(category: ConsentCategory): boolean {
  const { data } = useQuery(consentQueryOptions);
  return category === "necessary" || (data?.categories ?? []).includes(category);
}
