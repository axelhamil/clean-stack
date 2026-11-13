import type { QuotaTables } from "@modules/quotas/adapters/scoped-row-counter";
import { defineModule } from "inwire";

const quotaTables: QuotaTables = {};

export const quotaSources = defineModule<Record<never, never>>()((b) =>
  b.add("quotaTables", (): QuotaTables => quotaTables),
);
