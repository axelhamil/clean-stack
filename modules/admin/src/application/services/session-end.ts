import { EventTypes } from "@packages/events";
import { emitEvent } from "@packages/outbox/event-emitter";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import type { EndedSession } from "../ports/staff-store.port";

export async function announceSessionsEnded(
  outbox: IOutboxRepository,
  sessions: EndedSession[],
  actorUserId: string | null,
): Promise<void> {
  for (const { sessionId, userId } of sessions) {
    await emitEvent(outbox, EventTypes.USER_SIGNED_OUT, "session", sessionId, {
      userId,
      sessionId,
      actorUserId,
    });
  }
}
