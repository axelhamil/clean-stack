import { Badge } from "@packages/ui/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { chainVerifyQueryOptions } from "../api/audit-log.queries";

type ChainBadgeProps = {};

export function ChainBadge(_: ChainBadgeProps) {
  const { data, isLoading } = useQuery(chainVerifyQueryOptions);

  if (isLoading || !data) {
    return <Badge variant="secondary">Checking chain…</Badge>;
  }

  if (data.verified) {
    return <Badge variant="secondary">Chain verified ✓</Badge>;
  }

  return <Badge variant="destructive">Broken at #{data.brokenAtSequence}</Badge>;
}
