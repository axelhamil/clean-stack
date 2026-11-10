import { RequestSnapshots } from "../shared/auth/request-snapshots";
import type { ScimUserSnapshot } from "./queries";

/**
 * How long a value captured in `hooks.before`, or a row written by the request in
 * flight, may still be treated as belonging to that request. Generous enough that
 * no legitimate before→after round trip is ever cut off, short enough that a
 * stranded value cannot be picked up by a later, unrelated request.
 */
export const SNAPSHOT_TTL_MS = 30_000;

/**
 * `hooks.before` snapshots a provider's org/domain right before `/sso/delete-provider`
 * removes the row, the endpoint's response is `{ success: true }` with no provider
 * data, and the row is already gone by the time `hooks.after` runs. Keyed on
 * `providerId` (unique per row) rather than the hook's `ctx.context`, since better-call
 * rebuilds parts of that object between `hooks.before` and `hooks.after` and reference
 * identity across the two isn't guaranteed. Read-and-delete in the after hook.
 */
export const ssoProviderDeleteSnapshots = new RequestSnapshots<{
  organizationId: string | null;
  domain: string;
  issuer: string;
}>(SNAPSHOT_TTL_MS);

/**
 * The stored SCIM User a `PUT`, `PATCH` or `DELETE /scim/v2/Users/:userId` is about
 * to change, read in `hooks.before`: a deletion leaves nothing to read afterwards,
 * and a deactivation is only visible as the difference between the two states.
 * Keyed on the SCIM user id from the path, and only ever consumed by the after-hook
 * of a request that succeeded, which proves the plugin found that user inside the
 * caller's own connection. The snapshot is a database read, never request input,
 * so a stranded entry cannot carry anything a caller chose.
 */
export const scimUserSnapshots = new RequestSnapshots<
  ScimUserSnapshot & { memberId: string | undefined }
>(SNAPSHOT_TTL_MS);
