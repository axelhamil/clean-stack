import { and, eq, type resolveExecutor } from "@packages/drizzle";
import * as webhooksSchema from "../../../schemas/webhooks";

const we = webhooksSchema.webhookEndpoint;

export function ownedEndpointQuery(
  exec: ReturnType<typeof resolveExecutor>,
  endpointId: string,
  organizationId: string,
) {
  return exec
    .select({ id: we.id })
    .from(we)
    .where(and(eq(we.id, endpointId), eq(we.organizationId, organizationId)))
    .limit(1);
}
