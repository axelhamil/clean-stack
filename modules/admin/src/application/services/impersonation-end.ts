import { type AdminImpersonationStoppedPayload, EventTypes } from "@packages/events";
import { emitEvent } from "@packages/outbox/event-emitter";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import type { EndedImpersonation } from "../ports/repositories/staff-store.port";

export async function announceImpersonationsEnded(
  outbox: IOutboxRepository,
  ended: EndedImpersonation[],
  reason: AdminImpersonationStoppedPayload["endReason"],
  now: Date,
): Promise<void> {
  for (const session of ended) {
    const expired = session.expiresAt <= now;
    const endedAt = expired ? session.expiresAt : now;
    const payload = {
      actorUserId: session.impersonatedBy,
      userId: session.userId,
      durationMs: Math.max(0, endedAt.getTime() - session.createdAt.getTime()),
      endReason: expired ? "expired" : reason,
    } satisfies AdminImpersonationStoppedPayload;

    await emitEvent(
      outbox,
      EventTypes.ADMIN_IMPERSONATION_STOPPED,
      "user",
      session.userId,
      payload,
    );
  }
}
